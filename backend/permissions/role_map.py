from permissions.permissions import Permissions, ALL_PERMISSIONS


class Roles:
    ADMIN = "ADMIN"
    CDO = "CDO"
    DATA_STEWARD = "DATA_STEWARD"
    DATA_OWNER = "DATA_OWNER"
    DEVELOPER = "DEVELOPER"
    AUDITOR = "AUDITOR"
    ANALYST = "ANALYST"
    BUSINESS_USER = "BUSINESS_USER"


ROLE_PERMISSION_MAP = {
    Roles.ADMIN: ALL_PERMISSIONS,
    Roles.CDO: [
        Permissions.DASHBOARD_CDO,
        Permissions.GOVERNANCE_VIEW,
        Permissions.COMPLIANCE_VIEW,
        Permissions.REPORTS_VIEW,
        Permissions.LINEAGE_VIEW,
        Permissions.JOBS_VIEW,
    ],
    Roles.DATA_STEWARD: [
        Permissions.DASHBOARD_STEWARD,
        Permissions.JOBS_VIEW,
        Permissions.RULES_VIEW,
        Permissions.QUARANTINE_VIEW,
        Permissions.STEWARDSHIP_VIEW,
    ],
    Roles.DATA_OWNER: [
        Permissions.DASHBOARD_OWNER,
        Permissions.GOVERNANCE_VIEW,
        Permissions.COMPLIANCE_VIEW,
        Permissions.REPORTS_VIEW,
        Permissions.LINEAGE_VIEW,
    ],
    Roles.DEVELOPER: [
        Permissions.DASHBOARD_DEVELOPER,
        Permissions.JOBS_VIEW,
        Permissions.RULES_VIEW,
        Permissions.LINEAGE_VIEW,
    ],
    Roles.AUDITOR: [
        Permissions.DASHBOARD_AUDITOR,
        Permissions.AUDIT_VIEW,
        Permissions.COMPLIANCE_VIEW,
        Permissions.REPORTS_VIEW,
    ],
    Roles.ANALYST: [
        Permissions.DASHBOARD_ANALYST,
        Permissions.REPORTS_VIEW,
        Permissions.JOBS_VIEW,
    ],
    Roles.BUSINESS_USER: [
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.REPORTS_VIEW,
        Permissions.GOVERNANCE_VIEW,
        Permissions.JOBS_VIEW,
        Permissions.STEWARDSHIP_VIEW,
        Permissions.COMPLIANCE_VIEW,
        Permissions.LINEAGE_VIEW,
    ],
}


def normalize_role(role: str) -> str:
    value = str(role or Roles.BUSINESS_USER).strip().upper()
    aliases = {
        "STEWARD": Roles.DATA_STEWARD,
        "OWNER": Roles.DATA_OWNER,
        "BUSINESS": Roles.BUSINESS_USER,
        "BU": Roles.BUSINESS_USER,
    }
    value = aliases.get(value, value)
    if value in ROLE_PERMISSION_MAP:
        return value
    return Roles.BUSINESS_USER
