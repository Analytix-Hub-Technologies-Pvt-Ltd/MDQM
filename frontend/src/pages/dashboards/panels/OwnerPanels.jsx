import { useState } from "react";
import { Link } from "react-router-dom";
import EnterpriseDataPanel, { StatusBadge } from "../../../components/enterprise/EnterpriseDataPanel";
import {
  enterpriseGovernanceAccessRequests,
  enterpriseGovernanceDatasetCreate,
  enterpriseGovernanceDatasets,
  enterpriseGovernanceGlossary,
  enterpriseGovernanceGlossaryCreate,
  enterpriseGovernancePolicies,
  enterpriseGovernancePolicyCreate,
} from "../enterpriseApi";

const dsCols = [
  { key: "name", label: "Dataset" },
  { key: "domain", label: "Domain" },
  { key: "classification", label: "Class", render: (v) => <StatusBadge status={v || "standard"} /> },
  { key: "created_at", label: "Registered" },
];

const polCols = [
  { key: "policy_name", label: "Policy" },
  { key: "domain", label: "Domain" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
];

const glCols = [
  { key: "term", label: "Term" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "domain", label: "Domain" },
];

const accessCols = [
  { key: "id", label: "ID" },
  { key: "request_type", label: "Type" },
  { key: "request_ref", label: "Ref" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Created" },
];

function GovernanceDatasetSection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <GovernanceForms variant="datasets" onSuccess={bump} />
      <EnterpriseDataPanel
        key={`ds-${refreshKey}`}
        title="Registered datasets"
        columns={dsCols}
        searchPlaceholder="Name contains…"
        fetchPage={({ page, pageSize, query }) =>
          enterpriseGovernanceDatasets({
            page,
            page_size: pageSize,
            ...(query ? { q: query } : {}),
          })
        }
      />
    </div>
  );
}

function GovernancePoliciesSection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <GovernanceForms variant="policies" onSuccess={bump} />
      <EnterpriseDataPanel
        key={`pol-${refreshKey}`}
        title="Policies"
        columns={polCols}
        searchPlaceholder="Policy name…"
        fetchPage={({ page, pageSize, query }) =>
          enterpriseGovernancePolicies({
            page,
            page_size: pageSize,
            ...(query ? { q: query } : {}),
          })
        }
      />
    </div>
  );
}

function GovernanceGlossarySection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <GovernanceForms variant="glossary" onSuccess={bump} />
      <EnterpriseDataPanel
        key={`gl-${refreshKey}`}
        title="Business glossary"
        columns={glCols}
        fetchPage={({ page, pageSize, query }) => enterpriseGovernanceGlossary({ page, page_size: pageSize, q: query || undefined })}
      />
    </div>
  );
}

function GovernanceForms({ variant, onSuccess }) {
  const [dsName, setDsName] = useState("");
  const [dsDomain, setDsDomain] = useState("");
  const [dsClass, setDsClass] = useState("");
  const [dsMsg, setDsMsg] = useState("");

  const [polName, setPolName] = useState("");
  const [polDomain, setPolDomain] = useState("");
  const [polContent, setPolContent] = useState("");
  const [polMsg, setPolMsg] = useState("");

  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [termDomain, setTermDomain] = useState("");
  const [termMsg, setTermMsg] = useState("");

  const onDataset = async (e) => {
    e.preventDefault();
    setDsMsg("");
    try {
      await enterpriseGovernanceDatasetCreate({
        name: dsName.trim(),
        domain: dsDomain.trim() || null,
        classification: dsClass.trim() || null,
        description: null,
      });
      setDsMsg("Dataset registered.");
      setDsName("");
      onSuccess?.();
    } catch (err) {
      setDsMsg(err?.response?.data?.detail || "Save failed");
    }
  };

  const onPolicy = async (e) => {
    e.preventDefault();
    setPolMsg("");
    try {
      await enterpriseGovernancePolicyCreate({
        policy_name: polName.trim(),
        domain: polDomain.trim() || null,
        content: polContent.trim() || null,
      });
      setPolMsg("Policy created.");
      setPolName("");
      setPolContent("");
      onSuccess?.();
    } catch (err) {
      setPolMsg(err?.response?.data?.detail || "Save failed");
    }
  };

  const onTerm = async (e) => {
    e.preventDefault();
    setTermMsg("");
    try {
      await enterpriseGovernanceGlossaryCreate({
        term: term.trim(),
        definition: definition.trim(),
        domain: termDomain.trim() || null,
        status: "draft",
      });
      setTermMsg("Term added.");
      setTerm("");
      setDefinition("");
      onSuccess?.();
    } catch (err) {
      setTermMsg(err?.response?.data?.detail || "Save failed");
    }
  };

  if (variant === "datasets") {
    return (
      <div className="enterprise-card p-4 mb-4 text-sm space-y-2">
        <h3 className="enterprise-title text-sm">Register dataset</h3>
        <form onSubmit={onDataset} className="grid sm:grid-cols-2 gap-2 text-[#d7e3f7]">
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Unique name"
            value={dsName}
            onChange={(e) => setDsName(e.target.value)}
            required
          />
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Domain (optional)"
            value={dsDomain}
            onChange={(e) => setDsDomain(e.target.value)}
          />
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 sm:col-span-2"
            placeholder="Classification e.g. internal, confidential"
            value={dsClass}
            onChange={(e) => setDsClass(e.target.value)}
          />
          <button type="submit" className="sm:col-span-2 text-xs bg-[#2a4a7a] text-white py-2 rounded uppercase tracking-wide">
            Save to PostgreSQL
          </button>
        </form>
        {dsMsg ? <p className="text-xs text-[#9ab0d1]">{dsMsg}</p> : null}
      </div>
    );
  }
  if (variant === "policies") {
    return (
      <div className="enterprise-card p-4 mb-4 text-sm space-y-2">
        <h3 className="enterprise-title text-sm">New policy</h3>
        <form onSubmit={onPolicy} className="grid gap-2 text-[#d7e3f7]">
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Policy name"
            value={polName}
            onChange={(e) => setPolName(e.target.value)}
            required
          />
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Domain (optional)"
            value={polDomain}
            onChange={(e) => setPolDomain(e.target.value)}
          />
          <textarea
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 min-h-[80px]"
            placeholder="Policy text / notes"
            value={polContent}
            onChange={(e) => setPolContent(e.target.value)}
          />
          <button type="submit" className="text-xs bg-[#2a4a7a] text-white py-2 rounded uppercase tracking-wide">
            Create policy
          </button>
        </form>
        {polMsg ? <p className="text-xs text-[#9ab0d1]">{polMsg}</p> : null}
      </div>
    );
  }
  if (variant === "glossary") {
    return (
      <div className="enterprise-card p-4 mb-4 text-sm space-y-2">
        <h3 className="enterprise-title text-sm">Add glossary term</h3>
        <form onSubmit={onTerm} className="grid gap-2 text-[#d7e3f7]">
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            required
          />
          <textarea
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 min-h-[72px]"
            placeholder="Definition"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            required
          />
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Domain (optional)"
            value={termDomain}
            onChange={(e) => setTermDomain(e.target.value)}
          />
          <button type="submit" className="text-xs bg-[#2a4a7a] text-white py-2 rounded uppercase tracking-wide">
            Save term
          </button>
        </form>
        {termMsg ? <p className="text-xs text-[#9ab0d1]">{termMsg}</p> : null}
      </div>
    );
  }
  return null;
}

export function renderOwnerTab(tabId) {
  switch (tabId) {
    case "datasets":
      return <GovernanceDatasetSection />;
    case "policies":
      return <GovernancePoliciesSection />;
    case "glossary":
      return <GovernanceGlossarySection />;
    case "access-requests":
      return (
        <EnterpriseDataPanel
          title="Workflow access requests (governance.workflow_approvals)"
          columns={accessCols}
          searchPlaceholder="Filter by status (exact): pending"
          fetchPage={({ page, pageSize, query }) =>
            enterpriseGovernanceAccessRequests({
              page,
              page_size: pageSize,
              ...(query ? { status: query.trim() } : {}),
            })
          }
        />
      );
    case "certifications":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1]">
          <h3 className="enterprise-title mb-2">Certifications</h3>
          <p>Dataset certification workflow — tie-ins to governance policies and compliance reports.</p>
        </div>
      );
    case "lineage":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1]">
          <h3 className="enterprise-title mb-2">Lineage</h3>
          <Link to="/lineage" className="text-[#4f8cff] hover:underline">
            Open Lineage explorer →
          </Link>
        </div>
      );
    default:
      return null;
  }
}
