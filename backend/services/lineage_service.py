"""Lineage graph: seed from enterprise datasets + serve graph for business users."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

import models

# Reference-style default graph when DB has no datasets
_DEFAULT_NODES = [
    ("src_crm", "Salesforce CRM", "source", "Customer"),
    ("src_erp", "SAP ERP", "source", "Finance"),
    ("src_web", "Web Events", "source", "Customer"),
    ("src_pim", "Akeneo PIM", "source", "Product"),
    ("src_bank", "Core Banking", "source", "Finance"),
    ("master_customer", "Customer Master Hub", "dataset", "Customer"),
    ("master_product", "Product Information Mgmt", "dataset", "Product"),
    ("master_tx", "Transaction Ledger", "dataset", "Finance"),
    ("derived_dw", "Enterprise DW", "derived", "Analytics"),
    ("derived_reports", "Report Layer", "derived", "Analytics"),
    ("consumer_bi", "BI / Tableau", "consumer", "Analytics"),
    ("consumer_fin", "Finance Reports", "consumer", "Finance"),
]

_DEFAULT_EDGES = [
    ("src_crm", "master_customer", "feeds"),
    ("src_erp", "master_customer", "feeds"),
    ("src_web", "master_customer", "feeds"),
    ("src_pim", "master_product", "feeds"),
    ("src_erp", "master_product", "feeds"),
    ("src_bank", "master_tx", "feeds"),
    ("src_erp", "master_tx", "feeds"),
    ("master_customer", "derived_dw", "loads"),
    ("master_product", "derived_dw", "loads"),
    ("master_tx", "derived_dw", "loads"),
    ("derived_dw", "derived_reports", "aggregates"),
    ("derived_reports", "consumer_bi", "serves"),
    ("derived_reports", "consumer_fin", "serves"),
    ("master_customer", "consumer_bi", "serves"),
]


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (name or "node").lower()).strip("_")
    return s[:200] or "node"


def _upsert_node(db: Session, key: str, node_type: str, domain: str | None, *, label: str | None = None) -> models.LineageNode:
    """node_key is unique id; label is shown in UI (defaults to key)."""
    row = db.query(models.LineageNode).filter(models.LineageNode.node_key == key).first()
    if row:
        return row
    row = models.LineageNode(node_key=key, node_type=node_type, domain=domain)
    db.add(row)
    db.flush()
    return row


def _node_label(node: models.LineageNode) -> str:
    key = node.node_key or ""
    if key.startswith("ds:"):
        return key[3:]
    if key.startswith("src:"):
        return key[4:].replace("_", " ")
    return key.replace("_", " ")


def _upsert_edge(db: Session, from_key: str, to_key: str, relation: str = "feeds") -> None:
    fk = db.query(models.LineageNode).filter(models.LineageNode.node_key == from_key).first()
    tk = db.query(models.LineageNode).filter(models.LineageNode.node_key == to_key).first()
    if not fk or not tk:
        return
    exists = (
        db.query(models.LineageEdge)
        .filter(models.LineageEdge.from_node_id == fk.id, models.LineageEdge.to_node_id == tk.id)
        .first()
    )
    if exists:
        return
    db.add(models.LineageEdge(from_node_id=fk.id, to_node_id=tk.id, relation_type=relation))


def seed_lineage_from_datasets(db: Session, *, force: bool = False) -> dict[str, int]:
    """
    Populate governance.lineage_nodes / lineage_edges from enterprise.datasets.
    If no datasets exist, loads the reference default graph.
    """
    if not force and db.query(models.LineageNode).count() > 0:
        return {"nodes": db.query(models.LineageNode).count(), "edges": db.query(models.LineageEdge).count(), "seeded": 0}

    if force:
        db.query(models.LineageEdge).delete()
        db.query(models.LineageNode).delete()
        db.flush()

    datasets = db.query(models.EnterpriseDataset).order_by(models.EnterpriseDataset.name).all()
    nodes_added = 0
    edges_added = 0

    if datasets:
        reports = _upsert_node(db, "derived:report_layer", "derived", "Analytics")
        nodes_added += 1
        for ds in datasets:
            ds_key = f"ds:{ds.name}"
            _upsert_node(db, ds_key, "dataset", ds.domain)
            nodes_added += 1
            domain = (ds.domain or "").lower()
            sources: list[str] = []
            if "customer" in domain:
                sources = ["Salesforce CRM", "SAP ERP"]
            elif "product" in domain:
                sources = ["Akeneo PIM", "SAP ERP"]
            elif "finance" in domain or "transaction" in (ds.name or "").lower():
                sources = ["Core Banking", "SAP ERP"]
            elif "supplier" in domain:
                sources = ["SAP ERP", "Manual Upload"]
            else:
                sources = ["SAP ERP", "File Ingest"]
            for label in sources:
                sk = f"src:{label}"
                _upsert_node(db, sk, "source", ds.domain)
                _upsert_edge(db, sk, ds_key, "feeds")
                edges_added += 1
            _upsert_edge(db, ds_key, reports.node_key, "loads")
            edges_added += 1
        bi = _upsert_node(db, "consumer:bi_tableau", "consumer", "Analytics")
        _upsert_edge(db, reports.node_key, bi.node_key, "serves")
        edges_added += 1
    else:
        for key, label, ntype, domain in _DEFAULT_NODES:
            _upsert_node(db, key, ntype, domain)
            nodes_added += 1
        for fk, tk, rel in _DEFAULT_EDGES:
            _upsert_edge(db, fk, tk, rel)
            edges_added += 1

    db.commit()
    return {
        "nodes": db.query(models.LineageNode).count(),
        "edges": db.query(models.LineageEdge).count(),
        "seeded": nodes_added,
    }


def _filter_graph_subset(
    nodes: list[models.LineageNode],
    edges: list[models.LineageEdge],
    focus_keys: set[str],
) -> tuple[list[models.LineageNode], list[models.LineageEdge]]:
    if not focus_keys:
        return nodes, edges
    id_by_key = {n.node_key: n.id for n in nodes}
    key_by_id = {n.id: n.node_key for n in nodes}
    adj_out: dict[int, list[int]] = {}
    adj_in: dict[int, list[int]] = {}
    for e in edges:
        adj_out.setdefault(e.from_node_id, []).append(e.to_node_id)
        adj_in.setdefault(e.to_node_id, []).append(e.from_node_id)
    seed_ids = [id_by_key[k] for k in focus_keys if k in id_by_key]
    keep_ids: set[int] = set()
    for sid in seed_ids:
        stack = [sid]
        while stack:
            nid = stack.pop()
            if nid in keep_ids:
                continue
            keep_ids.add(nid)
            for nxt in adj_out.get(nid, []) + adj_in.get(nid, []):
                if nxt not in keep_ids:
                    stack.append(nxt)
    sub_nodes = [n for n in nodes if n.id in keep_ids]
    sub_edges = [e for e in edges if e.from_node_id in keep_ids and e.to_node_id in keep_ids]
    return sub_nodes, sub_edges


def lineage_graph_payload(db: Session, *, auto_seed: bool = True, dataset_name: str | None = None) -> dict[str, Any]:
    if auto_seed and db.query(models.LineageNode).count() == 0:
        seed_lineage_from_datasets(db)
    nodes = db.query(models.LineageNode).order_by(models.LineageNode.id).all()
    edges = db.query(models.LineageEdge).all()
    focus_label = (dataset_name or "").strip()
    focus_keys: set[str] = set()
    if focus_label:
        focus_keys.add(f"ds:{focus_label}")
        slug = _slug(focus_label)
        for n in nodes:
            if focus_label.lower() in (n.node_key or "").lower() or focus_label.lower() in _node_label(n).lower():
                focus_keys.add(n.node_key)
        nodes, edges = _filter_graph_subset(nodes, edges, focus_keys)
    id_to_key = {n.id: n.node_key for n in nodes}
    return {
        "focus_dataset": focus_label or None,
        "nodes": [
            {
                "id": n.id,
                "key": n.node_key,
                "label": _node_label(n),
                "type": n.node_type,
                "domain": n.domain,
                "highlight": n.node_key in focus_keys if focus_keys else False,
            }
            for n in nodes
        ],
        "edges": [
            {
                "id": e.id,
                "from": e.from_node_id,
                "to": e.to_node_id,
                "from_key": id_to_key.get(e.from_node_id),
                "to_key": id_to_key.get(e.to_node_id),
                "relation": e.relation_type,
            }
            for e in edges
        ],
    }
