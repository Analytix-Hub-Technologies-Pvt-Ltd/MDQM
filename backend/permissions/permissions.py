class Permissions:
    DASHBOARD_ADMIN = "dashboard.admin"
    DASHBOARD_CDO = "dashboard.cdo"
    DASHBOARD_STEWARD = "dashboard.steward"
    DASHBOARD_OWNER = "dashboard.owner"
    DASHBOARD_DEVELOPER = "dashboard.developer"
    DASHBOARD_AUDITOR = "dashboard.auditor"
    DASHBOARD_ANALYST = "dashboard.analyst"
    DASHBOARD_VIEWER = "dashboard.viewer"

    JOBS_VIEW = "jobs.view"
    RULES_VIEW = "rules.view"
    QUARANTINE_VIEW = "quarantine.view"
    GOVERNANCE_VIEW = "governance.view"
    COMPLIANCE_VIEW = "compliance.view"
    REPORTS_VIEW = "reports.view"
    ADMIN_VIEW = "admin.view"
    AUDIT_VIEW = "audit.view"
    LINEAGE_VIEW = "lineage.view"
    STEWARDSHIP_VIEW = "stewardship.view"


ALL_PERMISSIONS = [value for key, value in Permissions.__dict__.items() if not key.startswith("_")]
