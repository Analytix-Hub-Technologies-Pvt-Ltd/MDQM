"""Analytix Hub test account emails + passwords for password-only sync (no new users)."""

from __future__ import annotations

from permissions.role_map import Roles

# Plaintext passwords exist only here for seeding; auth.users.password_hash stores bcrypt digests.
DEMO_USERS: list[dict[str, str]] = [
    {
        "email": "sundarlingam.rajasekar@analytixhub.ai",
        "role": Roles.ADMIN,
        "full_name": "Admin",
        "password": "Sudharsen@9",
    },
    {
        "email": "cdo.test@analytixhub.ai",
        "role": Roles.CDO,
        "full_name": "CDO Test",
        "password": "Test@123",
    },
    {
        "email": "steward.test@analytixhub.ai",
        "role": Roles.DATA_STEWARD,
        "full_name": "Data Steward Test",
        "password": "Test@123",
    },
    {
        "email": "owner.test@analytixhub.ai",
        "role": Roles.DATA_OWNER,
        "full_name": "Data Owner Test",
        "password": "Test@123",
    },
    {
        "email": "developer.test@analytixhub.ai",
        "role": Roles.DEVELOPER,
        "full_name": "Developer Test",
        "password": "Test@123",
    },
    {
        "email": "auditor.test@analytixhub.ai",
        "role": Roles.AUDITOR,
        "full_name": "Auditor Test",
        "password": "Test@123",
    },
    {
        "email": "analyst.test@analytixhub.ai",
        "role": Roles.ANALYST,
        "full_name": "Analyst Test",
        "password": "Test@123",
    },
    {
        "email": "business.test@analytixhub.ai",
        "role": Roles.BUSINESS_USER,
        "full_name": "Business User Test",
        "password": "Test@123",
    },
]
