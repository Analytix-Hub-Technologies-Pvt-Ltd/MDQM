import math
import os
import json
import re
from datetime import datetime, timezone
import pandas as pd
from dateutil import parser as date_parser
from sqlalchemy import text
from sqlalchemy.orm import Session
from rapidfuzz import fuzz

import models
from services.job_source_config_service import read_job_source_config
from services.dataset_join_service import list_join_sources, load_join_source_df, normalize_join_keys
from services.dataset_row_storage_service import (
    load_dataframe,
    _INTERNAL_COLS,
    _normalize_value,
)
from services.physical_table_manager import (
    DATASETS_SCHEMA,
    get_physical_table_name,
    full_table_ref,
    sanitize_column_name,
    table_exists,
)


def _job_cfg(job: models.Job) -> dict:
    return dict(read_job_source_config(job))


def parse_date_safe(val):
    if val is None:
        return None
    s = str(val).strip()
    if not s or len(s) < 5 or s.lower() in ("nan", "none", "<na>"):
        return None
    try:
        return date_parser.parse(s)
    except Exception:
        try:
            return pd.to_datetime(s)
        except Exception:
            return None


def get_source_priority_score(source: str, other_source: str, priority_list: list) -> int:
    try:
        idx_self = priority_list.index(source)
    except ValueError:
        idx_self = 999
    try:
        idx_other = priority_list.index(other_source)
    except ValueError:
        idx_other = 999

    if idx_self < idx_other:
        return 20
    return 0


def determine_tie_breaker_winner(source_A: str, source_B: str, val_A, val_B, priority_list: list) -> str:
    has_A = val_A is not None and str(val_A).strip() != ""
    has_B = val_B is not None and str(val_B).strip() != ""
    if has_A and not has_B:
        return source_A
    if has_B and not has_A:
        return source_B

    str_A = str(val_A).strip() if val_A is not None else ""
    str_B = str(val_B).strip() if val_B is not None else ""
    if len(str_A) > len(str_B):
        return source_A
    if len(str_B) > len(str_A):
        return source_B

    try:
        idx_A = priority_list.index(source_A)
    except ValueError:
        idx_A = 999
    try:
        idx_B = priority_list.index(source_B)
    except ValueError:
        idx_B = 999

    if idx_A <= idx_B:
        return source_A
    return source_B


_ALIGNMENT_PROMPT = """
You are a master data quality engine.
Your task is to align columns between a Base Dataset and a Join Source dataset.
Identify which columns in the Join Source are semantically the SAME field as a column in the Base Dataset, even if they have different names (e.g., 'cname' or 'customer_name' matches 'name', 'email1' matches 'email', 'mobile' matches 'phone').

You will be given:
1. Base Dataset column names
2. Base Dataset sample data (as a list of dictionaries, if available)
3. Join Source column names
4. Join Source sample data (as a list of dictionaries, if available)

Only match columns that are logically the same type of information and represent the same field. Do not force matches for columns that do not represent the same field.

You MUST reply ONLY with a JSON object mapping Join Source column names to their matching Base Dataset column names. Do not include any explanation or markdown formatting outside the JSON block.

Example output:
{
  "cname": "name",
  "email1": "email"
}
"""


def _heuristic_align(base_cols: list[str], join_cols: list[str]) -> dict[str, str]:
    mapping = {}
    for jc in join_cols:
        jc_clean = re.sub(r"[_\s]+", "", jc.lower())
        best_match = None
        best_score = 0.0
        for bc in base_cols:
            bc_clean = re.sub(r"[_\s]+", "", bc.lower())
            if jc_clean == bc_clean:
                best_match = bc
                break
            score = fuzz.ratio(jc_clean, bc_clean)
            if score > 80 and score > best_score:
                best_score = score
                best_match = bc
        if best_match:
            mapping[jc] = best_match
    return mapping


def _llm_align_columns(
    base_cols: list[str],
    join_cols: list[str],
    base_sample: list[dict] | None = None,
    join_sample: list[dict] | None = None,
) -> dict[str, str]:
    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        return _heuristic_align(base_cols, join_cols)

    try:
        from groq import Groq
        from services.groq_description_service import GROQ_DEFAULT_MODEL, GROQ_TIMEOUT_SECONDS

        model = (os.environ.get("GROQ_MODEL") or GROQ_DEFAULT_MODEL).strip()
        client = Groq(api_key=api_key, timeout=GROQ_TIMEOUT_SECONDS + 5, max_retries=0)

        prompt_input = {
            "base_columns": base_cols,
            "join_columns": join_cols,
        }
        if base_sample:
            prompt_input["base_sample_rows"] = base_sample[:5]
        if join_sample:
            prompt_input["join_sample_rows"] = join_sample[:5]

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _ALIGNMENT_PROMPT},
                {"role": "user", "content": json.dumps(prompt_input, indent=2)},
            ],
            temperature=0.1,
            max_tokens=300,
        )
        raw = (response.choices[0].message.content or "").strip() if response.choices else ""
        if raw.startswith("```"):
            lines = raw.split("\n")
            if lines[0].startswith("```json"):
                raw = "\n".join(lines[1:-1])
            elif lines[0].startswith("```"):
                raw = "\n".join(lines[1:-1])
        raw = raw.strip()
        payload = json.loads(raw)
        if isinstance(payload, dict):
            clean_map = {}
            for k, v in payload.items():
                if k in join_cols and v in base_cols:
                    clean_map[k] = v
            return clean_map
    except Exception as exc:
        # Fallback silently to heuristics on any connection/parsing error
        pass
    return _heuristic_align(base_cols, join_cols)


def get_dataset_source_column_mapping(db: Session, job: models.Job) -> dict[str, dict[str, str]]:
    """
    Returns mapping: {logical_column_name: {source_label: physical_column_name}}
    """
    from services.dataset_join_service import _load_base_dataframe, _primary_table
    from services.dataset_db_import import (
        normalize_dataframe_columns,
        resolve_column_in_frame,
    )

    primary = _primary_table(db, job.job_id)
    if not primary:
        return {}

    try:
        base_df = normalize_dataframe_columns(_load_base_dataframe(db, job))
    except Exception:
        base_df = pd.DataFrame()

    result_cols = list(base_df.columns)
    mapping = {}

    excluded_cols = {
        "id", "job_id", "table_id", 
        "_row_index", "row_index",
        "_dq_passed", "dq_passed",
        "_is_golden", "is_golden", "is_golden_record",
        "_dq_remarks", "dq_remarks",
        "_golden_remarks", "golden_remarks"
    }

    for col in result_cols:
        col_lower = col.lower()
        if col_lower not in excluded_cols and not col_lower.startswith("__dq_"):
            mapping[col] = {"Primary": col}

    joins = _job_cfg(job).get("join_sources") or []
    for j in joins:
        if not isinstance(j, dict) or j.get("materialized") is False or j.get("status") == "broken":
            continue

        label = j.get("label") or j.get("file_name") or j.get("table_name") or "Join source"
        try:
            right_df = load_join_source_df(job.job_id, j)
            right_df = normalize_dataframe_columns(right_df)
        except Exception:
            continue

        selected = j.get("selected_columns") or []
        user_aliases = j.get("column_aliases") or {}
        key_pairs = normalize_join_keys(j)

        left_cols = []
        right_cols = []
        for pair in key_pairs:
            left_key = pair["left_key"]
            right_key = pair["right_key"]
            left_col = resolve_column_in_frame(pd.DataFrame(columns=result_cols), left_key)
            right_col = resolve_column_in_frame(right_df, right_key)
            if left_col:
                left_cols.append(left_col)
            if right_col:
                right_cols.append(right_col)

        resolved_selected = []
        for col_name in selected or list(right_df.columns):
            match = resolve_column_in_frame(right_df, col_name)
            if match and match not in resolved_selected:
                resolved_selected.append(match)
        for right_col in right_cols:
            if right_col not in resolved_selected:
                resolved_selected.append(right_col)

        keep_cols = list(dict.fromkeys(resolved_selected))

        overlap = (set(result_cols) & set(keep_cols)) - set(left_cols) - set(right_cols)
        rename = {c: f"{c}_joined" for c in overlap}

        alias_rename = {}
        if user_aliases:
            for src_name, alias_name in user_aliases.items():
                col = resolve_column_in_frame(right_df, src_name)
                if not col and f"{src_name}_joined" in rename.values():
                    for k, v in rename.items():
                        if v == f"{src_name}_joined":
                            col = k
                            break
                if not col or col in right_cols:
                    continue
                alias_rename[col] = alias_name

        base_candidates = [c for c in result_cols if c not in left_cols and c.lower() not in excluded_cols and not c.lower().startswith("__dq_")]
        join_candidates = [c for c in keep_cols if c not in right_cols]

        base_sample = base_df.fillna("").to_dict(orient="records") if not base_df.empty else None
        join_sample = right_df.fillna("").to_dict(orient="records") if not right_df.empty else None

        ai_align = _llm_align_columns(base_candidates, join_candidates, base_sample, join_sample)

        for col in keep_cols:
            if col in right_cols:
                continue
            phys_name = col
            if col in alias_rename:
                phys_name = alias_rename[col]
            elif col in rename:
                phys_name = rename[col]

            logical_name = ai_align.get(col, col)
            if logical_name not in mapping:
                mapping[logical_name] = {}
            mapping[logical_name][label] = phys_name

        next_cols = []
        for col in result_cols:
            next_cols.append(col)
        for col in keep_cols:
            if col in right_cols:
                continue
            phys_name = col
            if col in alias_rename:
                phys_name = alias_rename[col]
            elif col in rename:
                phys_name = rename[col]
            if phys_name not in next_cols:
                next_cols.append(phys_name)
        result_cols = next_cols

    return mapping


def analyze_dataset_for_merge(db: Session, dataset_id: int, config: dict) -> dict:
    dataset = db.query(models.EnterpriseDataset).filter(models.EnterpriseDataset.id == dataset_id).first()
    if not dataset:
        raise ValueError("Dataset not found")

    job_id = dataset.job_id
    if not job_id:
        raise ValueError("Dataset has no linked job")

    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        raise ValueError("Job not found")

    # Load active joins
    active_joins = [j for j in list_join_sources(job) if j.get("materialized") is not False and j.get("status") != "broken"]
    join_labels = [j.get("label") or j.get("file_name") or j.get("table_name") or "Join source" for j in active_joins]
    all_sources = ["Primary"] + join_labels

    # Determine priority list from user config, default is ["Primary", ...join_labels]
    priority_list = config.get("source_priority", [])
    if not priority_list:
        priority_list = all_sources
    else:
        # align priority_list to only include currently active sources
        priority_list = [s for s in priority_list if s in all_sources]
        for s in all_sources:
            if s not in priority_list:
                priority_list.append(s)

    auto_merge_threshold = float(config.get("auto_merge_threshold", 95.0))
    review_threshold = float(config.get("review_threshold", 70.0))
    column_overrides = config.get("column_overrides", {})

    # Save merge config snapshot in db if config was run
    save_merge_config(db, dataset_id, {
        "source_priority": priority_list,
        "auto_merge_threshold": auto_merge_threshold,
        "review_threshold": review_threshold,
        "column_overrides": column_overrides
    })

    # Delete old candidates for this dataset
    db.query(models.GoldenMergeCandidate).filter(models.GoldenMergeCandidate.dataset_id == dataset_id).delete()
    db.commit()

    # Get column mapping
    mapping = get_dataset_source_column_mapping(db, job)
    if not mapping:
        return {"analyzed": 0, "auto_merged": 0, "pending_review": 0, "conflicts": 0}

    # Load base table metadata
    from services.dataset_join_service import _primary_table
    primary_table = _primary_table(db, job_id)
    if not primary_table:
        return {"analyzed": 0, "auto_merged": 0, "pending_review": 0, "conflicts": 0}

    # Load merged data rows
    tbl_name = get_physical_table_name(job_id, primary_table.table_id)
    fqn = full_table_ref(tbl_name)
    sql = f"SELECT * FROM {fqn} ORDER BY _row_index"
    try:
        with db.get_bind().connect() as conn:
            result = conn.execute(text(sql))
            columns = list(result.keys())
            rows = [dict(zip(columns, r)) for r in result.fetchall()]
    except Exception:
        # Fallback to EAV rows if physical table doesn't exist
        from services.dataset_row_storage_service import _load_flat_rows_from_legacy
        rows = _load_flat_rows_from_legacy(db, job_id, primary_table.table_id)

    # Determine left join keys
    left_keys = []
    for j in active_joins:
        for pair in j.get("join_keys", []):
            left_key = pair.get("left_key")
            if left_key and left_key not in left_keys:
                left_keys.append(left_key)
        if not j.get("join_keys") and j.get("left_key"):
            left_key = j.get("left_key")
            if left_key and left_key not in left_keys:
                left_keys.append(left_key)

    if not left_keys:
        left_keys = ["id"] # default fallback

    summary = {"analyzed": 0, "auto_merged": 0, "pending_review": 0, "conflicts": 0}
    now_naive = datetime.now()
    now_aware = datetime.now(timezone.utc)

    # We need to compare top 2 sources in the priority list
    if len(priority_list) < 2:
        return {"analyzed": 0, "auto_merged": 0, "pending_review": 0, "conflicts": 0}

    source_A = priority_list[0]
    source_B = priority_list[1]

    for row in rows:
        # Get join key values
        key_vals = []
        for k in left_keys:
            val = row.get(k)
            if val is not None:
                key_vals.append(str(val))
        row_group_key = ", ".join(key_vals) if key_vals else str(row.get("_row_index", "0"))

        # Build source_values: {source: {col: val, ...}}
        source_values = {}
        for src in [source_A, source_B]:
            source_values[src] = {}
            for col, src_map in mapping.items():
                phys_col = src_map.get(src)
                val = row.get(phys_col) if phys_col else None
                source_values[src][col] = val

        # Check if B has a match: if all values for Source B are null, skip (no pair to merge)
        b_has_data = any(v is not None and str(v).strip() != "" for v in source_values[source_B].values())
        if not b_has_data:
            continue

        summary["analyzed"] += 1

        column_scores = {}
        row_scores_sum = 0.0
        cols_evaluated = 0

        for col in mapping:
            val_A = source_values[source_A].get(col)
            val_B = source_values[source_B].get(col)

            # a. Completeness score
            comp_A = 30 if (val_A is not None and str(val_A).strip() != "") else 0
            comp_B = 30 if (val_B is not None and str(val_B).strip() != "") else 0

            # b. Source priority score (A is higher because it's first)
            priority_A = 20
            priority_B = 0

            # c. String similarity
            str_A = str(val_A).strip() if val_A is not None else ""
            str_B = str(val_B).strip() if val_B is not None else ""
            if not str_A and not str_B:
                sim_score = 0.0
            else:
                sim_ratio = fuzz.token_set_ratio(str_A, str_B)
                sim_score = (sim_ratio / 100.0) * 50.0

            # d. Date recency bonus
            recency_A = 0
            recency_B = 0
            dt_A = parse_date_safe(val_A)
            dt_B = parse_date_safe(val_B)
            if dt_A or dt_B:
                # Ensure they match naive/aware
                if dt_A and dt_B:
                    if dt_A.tzinfo is not None and dt_B.tzinfo is None:
                        dt_B = dt_B.replace(tzinfo=dt_A.tzinfo)
                    elif dt_B.tzinfo is not None and dt_A.tzinfo is None:
                        dt_A = dt_A.replace(tzinfo=dt_B.tzinfo)

                dt_A_ok = dt_A is not None and (dt_A <= now_aware if dt_A.tzinfo is not None else dt_A <= now_naive)
                dt_B_ok = dt_B is not None and (dt_B <= now_aware if dt_B.tzinfo is not None else dt_B <= now_naive)

                if dt_A_ok and dt_B_ok:
                    if dt_A > dt_B:
                        recency_A = 20
                    elif dt_B > dt_A:
                        recency_B = 20
                elif dt_A_ok and not dt_B_ok:
                    recency_A = 20
                elif dt_B_ok and not dt_A_ok:
                    recency_B = 20

            # Total score per source
            score_A = comp_A + priority_A + sim_score + recency_A
            score_B = comp_B + priority_B + sim_score + recency_B

            col_score = min(100.0, max(score_A, score_B))

            # Determine winner source and value
            winner_src = None
            if score_A > score_B:
                winner_src = source_A
            elif score_B > score_A:
                winner_src = source_B
            else:
                # Tie breaker
                winner_src = determine_tie_breaker_winner(source_A, source_B, val_A, val_B, priority_list)

            # e. Column overrides
            override = column_overrides.get(col)
            if override == f"always_{source_A}":
                winner_src = source_A
                col_score = 100.0
            elif override == f"always_{source_B}":
                winner_src = source_B
                col_score = 100.0

            winner_val = source_values[winner_src].get(col)

            column_scores[col] = {
                "winner_source": winner_src,
                "winner_value": winner_val,
                "score": col_score,
                "all_values": {
                    source_A: val_A,
                    source_B: val_B
                }
            }

            row_scores_sum += col_score
            cols_evaluated += 1

        # Use the maximum column score rather than the cumulative average to determine matching
        row_score = max(column_scores[col]["score"] for col in column_scores) if cols_evaluated > 0 else 100.0

        # Determine status
        status = "pending"
        golden_values = None
        if row_score >= auto_merge_threshold:
            status = "auto_merged"
            golden_values = {col: column_scores[col]["winner_value"] for col in column_scores}
            summary["auto_merged"] += 1
        elif row_score >= review_threshold:
            status = "pending"
            summary["pending_review"] += 1
        else:
            status = "conflict"
            summary["conflicts"] += 1

        # Create golden merge candidate record
        cand = models.GoldenMergeCandidate(
            dataset_id=dataset_id,
            row_group_key=row_group_key,
            source_values=source_values,
            column_scores=column_scores,
            row_score=row_score,
            status=status,
            golden_values=golden_values,
            merge_config_snapshot={
                "source_priority": priority_list,
                "auto_merge_threshold": auto_merge_threshold,
                "review_threshold": review_threshold,
                "column_overrides": column_overrides
            }
        )
        db.add(cand)
        db.flush() # flush to get candidate id

        if status == "auto_merged" and golden_values:
            apply_golden_values_to_table(db, dataset_id, job_id, primary_table.table_id, row_group_key, golden_values)

    db.commit()
    return summary


def get_merge_candidates(db: Session, dataset_id: int, page: int = 1, page_size: int = 20, status_filter: str = "all") -> dict:
    query = db.query(models.GoldenMergeCandidate).filter(models.GoldenMergeCandidate.dataset_id == dataset_id)
    if status_filter and status_filter != "all":
        query = query.filter(models.GoldenMergeCandidate.status == status_filter)

    total = query.count()
    candidates = query.order_by(models.GoldenMergeCandidate.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # Calculate status counts for summary
    total_q = db.query(models.GoldenMergeCandidate).filter(models.GoldenMergeCandidate.dataset_id == dataset_id)
    pending_count = total_q.filter(models.GoldenMergeCandidate.status == "pending").count()
    auto_merged_count = total_q.filter(models.GoldenMergeCandidate.status == "auto_merged").count()
    approved_count = total_q.filter(models.GoldenMergeCandidate.status == "approved").count()
    rejected_count = total_q.filter(models.GoldenMergeCandidate.status == "rejected").count()
    conflict_count = total_q.filter(models.GoldenMergeCandidate.status == "conflict").count()

    dataset = db.query(models.EnterpriseDataset).filter(models.EnterpriseDataset.id == dataset_id).first()
    job_id = dataset.job_id if dataset else None
    
    # Calculate Quality improvement completeness pct
    improvement = 0.0
    if job_id:
        resolved_candidates = db.query(models.GoldenMergeCandidate).filter(
            models.GoldenMergeCandidate.dataset_id == dataset_id,
            models.GoldenMergeCandidate.status.in_(["auto_merged", "approved"])
        ).all()

        if resolved_candidates:
            job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
            if job:
                mapping = get_dataset_source_column_mapping(db, job)
                cols = list(mapping.keys())
            else:
                cols = []
            if cols:
                total_cells = len(resolved_candidates) * len(cols)
                primary_non_null = 0
                golden_non_null = 0
                for rc in resolved_candidates:
                    prim_vals = rc.source_values.get("Primary", {})
                    gold_vals = rc.golden_values or {}
                    for col in cols:
                        pv = prim_vals.get(col)
                        if pv is not None and str(pv).strip() != "":
                            primary_non_null += 1
                        gv = gold_vals.get(col)
                        if gv is not None and str(gv).strip() != "":
                            golden_non_null += 1

                if total_cells > 0:
                    prim_pct = (primary_non_null / total_cells) * 100.0
                    gold_pct = (golden_non_null / total_cells) * 100.0
                    improvement = max(0.0, gold_pct - prim_pct)

    items = []
    for c in candidates:
        items.append({
            "id": c.id,
            "dataset_id": c.dataset_id,
            "row_group_key": c.row_group_key,
            "source_values": c.source_values,
            "column_scores": c.column_scores,
            "row_score": c.row_score,
            "status": c.status,
            "golden_values": c.golden_values,
            "resolved_by_user_id": c.resolved_by_user_id,
            "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
            "created_at": c.created_at.isoformat(),
            "merge_config_snapshot": c.merge_config_snapshot
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": {
            "total": total_q.count(),
            "pending": pending_count,
            "auto_merged": auto_merged_count,
            "approved": approved_count,
            "rejected": rejected_count,
            "conflict": conflict_count
        },
        "quality_improvement_pct": round(improvement, 2)
    }


def resolve_candidate(db: Session, candidate_id: int, approved_values: dict, action: str, user_id: int) -> dict:
    candidate = db.query(models.GoldenMergeCandidate).filter(models.GoldenMergeCandidate.id == candidate_id).first()
    if not candidate:
        raise ValueError("Candidate not found")

    candidate.status = "approved" if action == "approve" else "rejected"
    if action == "approve":
        candidate.golden_values = approved_values
    else:
        candidate.golden_values = None
    candidate.resolved_by_user_id = user_id
    candidate.resolved_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "id": candidate.id,
        "status": candidate.status,
        "golden_values": candidate.golden_values,
        "resolved_by_user_id": candidate.resolved_by_user_id,
        "resolved_at": candidate.resolved_at.isoformat() if candidate.resolved_at else None
    }


def get_merge_config(db: Session, dataset_id: int) -> dict:
    dataset = db.query(models.EnterpriseDataset).filter(models.EnterpriseDataset.id == dataset_id).first()
    columns_list = []
    if dataset and dataset.job_id:
        job = db.query(models.Job).filter(models.Job.job_id == dataset.job_id).first()
        if job:
            mapping = get_dataset_source_column_mapping(db, job)
            columns_list = list(mapping.keys())

    config = db.query(models.GoldenMergeConfig).filter(models.GoldenMergeConfig.dataset_id == dataset_id).first()
    if not config:
        # Return default config
        return {
            "dataset_id": dataset_id,
            "source_priority": [],
            "auto_merge_threshold": 95.0,
            "review_threshold": 70.0,
            "column_overrides": {},
            "columns": columns_list
        }
    return {
        "dataset_id": config.dataset_id,
        "source_priority": config.source_priority,
        "auto_merge_threshold": config.auto_merge_threshold,
        "review_threshold": config.review_threshold,
        "column_overrides": config.column_overrides,
        "columns": columns_list
    }


def save_merge_config(db: Session, dataset_id: int, config_data: dict) -> dict:
    config = db.query(models.GoldenMergeConfig).filter(models.GoldenMergeConfig.dataset_id == dataset_id).first()
    if not config:
        config = models.GoldenMergeConfig(dataset_id=dataset_id)
        db.add(config)

    config.source_priority = config_data.get("source_priority", [])
    config.auto_merge_threshold = float(config_data.get("auto_merge_threshold", 95.0))
    config.review_threshold = float(config_data.get("review_threshold", 70.0))
    config.column_overrides = config_data.get("column_overrides", {})
    db.commit()
    return {
        "dataset_id": config.dataset_id,
        "source_priority": config.source_priority,
        "auto_merge_threshold": config.auto_merge_threshold,
        "review_threshold": config.review_threshold,
        "column_overrides": config.column_overrides
    }


def apply_golden_values_to_table(
    db: Session,
    dataset_id: int,
    job_id: int,
    table_id: int,
    row_group_key: str,
    golden_values: dict,
    remarks: str = "Golden record auto-merged"
) -> None:
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        return
    active_joins = [j for j in list_join_sources(job) if j.get("materialized") is not False and j.get("status") != "broken"]
    left_keys = []
    for j in active_joins:
        for pair in j.get("join_keys", []):
            left_key = pair.get("left_key")
            if left_key and left_key not in left_keys:
                left_keys.append(left_key)
        if not j.get("join_keys") and j.get("left_key"):
            left_key = j.get("left_key")
            if left_key and left_key not in left_keys:
                left_keys.append(left_key)
    if not left_keys:
        left_keys = ["id"]

    key_vals = [s.strip() for s in row_group_key.split(",")]

    tbl_name = get_physical_table_name(job_id, table_id)
    fqn = full_table_ref(tbl_name)
    engine = db.get_bind()
    
    with engine.connect() as conn:
        phys_exists = table_exists(conn, tbl_name, DATASETS_SCHEMA)

    row_index = None
    if phys_exists:
        where_clauses = []
        where_params = {}
        for i, k in enumerate(left_keys):
            if i < len(key_vals):
                where_clauses.append(f"{sanitize_column_name(k)} = :val_{i}")
                where_params[f"val_{i}"] = key_vals[i]
        
        if where_clauses:
            where_str = " AND ".join(where_clauses)
            sql_idx = f"SELECT _row_index FROM {fqn} WHERE {where_str} LIMIT 1"
            with engine.connect() as conn:
                res_idx = conn.execute(text(sql_idx), where_params).fetchone()
                if res_idx:
                    row_index = int(res_idx[0])
    else:
        headers = db.query(models.DatasetRow).filter(
            models.DatasetRow.job_id == job_id,
            models.DatasetRow.table_id == table_id
        ).all()
        for h in headers:
            match = True
            row_data = h.row_data or {}
            for i, k in enumerate(left_keys):
                if i < len(key_vals):
                    if str(row_data.get(k)) != key_vals[i]:
                        match = False
                        break
            if match:
                row_index = h.row_index + 1
                break

    if row_index is None:
        return

    # 1. Update physical table if it exists
    if phys_exists:
        set_clauses = ["_is_golden = :is_golden", "_golden_remarks = :golden_remarks"]
        params = {"is_golden": True, "golden_remarks": remarks, "row_idx": row_index}

        for col, val in golden_values.items():
            safe_col = sanitize_column_name(col)
            set_clauses.append(f"{safe_col} = :{safe_col}")
            params[safe_col] = str(val) if val is not None else None

        sql_str = f"UPDATE {fqn} SET {', '.join(set_clauses)} WHERE _row_index = :row_idx"
        with engine.begin() as conn:
            conn.execute(text(sql_str), params)
        return

    # 2. Update legacy EAV storage if it falls back to EAV
    header = (
        db.query(models.DatasetRow)
        .filter(
            models.DatasetRow.job_id == job_id,
            models.DatasetRow.table_id == table_id,
            models.DatasetRow.row_index == row_index - 1, # EAV is 0-indexed
        )
        .first()
    )
    if header:
        header.is_golden_record = True
        header.golden_remarks = remarks
        for col, val in golden_values.items():
            cell = (
                db.query(models.DatasetRowCell)
                .filter(
                    models.DatasetRowCell.job_id == job_id,
                    models.DatasetRowCell.table_id == table_id,
                    models.DatasetRowCell.row_index == row_index - 1,
                    models.DatasetRowCell.column_name == col,
                )
                .first()
            )
            if cell:
                cell.value_text = str(val) if val is not None else ""
        db.commit()

