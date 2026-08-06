"""One-off: migrate Upload/{user}/ → Upload/{Role}/{user}/ and backfill user_role."""
from __future__ import annotations

import os
import shutil

from sqlalchemy import text

from database import SessionLocal
from utils.upload_paths import role_upload_folder

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_ROOT = os.path.join(BACKEND, "Upload")


def main() -> None:
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE datasets.uploads ADD COLUMN IF NOT EXISTS user_role TEXT"))
        db.commit()

        rows = db.execute(
            text(
                "SELECT id, username, user_id, relative_path, absolute_path "
                "FROM datasets.uploads ORDER BY id"
            )
        ).fetchall()

        for rid, username, user_id, rel, abs_p in rows:
            role = "DATA_OWNER"
            if user_id is not None:
                r = db.execute(
                    text("SELECT role FROM auth.users WHERE id = :id"),
                    {"id": user_id},
                ).fetchone()
                if r and r[0]:
                    role = str(r[0]).strip().upper()

            role_folder = role_upload_folder(role)
            rel_norm = (rel or "").replace("\\", "/")
            parts = rel_norm.split("/")
            # Already role-scoped?
            known = {
                "Admin",
                "CDO",
                "Data_Steward",
                "Data_Owner",
                "Developer",
                "Auditor",
                "Analyst",
                "Business_User",
            }
            if len(parts) >= 2 and parts[0] == "Upload" and parts[1] in known:
                db.execute(
                    text("UPDATE datasets.uploads SET user_role = :role WHERE id = :id"),
                    {"role": role, "id": rid},
                )
                continue

            # Upload/dataowner/2026/08/file → Upload/Data_Owner/dataowner/2026/08/file
            if len(parts) >= 2 and parts[0] == "Upload":
                new_rel = "/".join(["Upload", role_folder] + parts[1:])
            else:
                new_rel = f"Upload/{role_folder}/{username}/migrated/{os.path.basename(rel_norm or 'file')}"

            new_abs = os.path.join(BACKEND, *new_rel.split("/"))
            os.makedirs(os.path.dirname(new_abs), exist_ok=True)
            src = abs_p if abs_p and os.path.isfile(abs_p) else os.path.join(BACKEND, *rel_norm.split("/"))
            if os.path.isfile(src) and os.path.normpath(src) != os.path.normpath(new_abs):
                shutil.move(src, new_abs)
                print(f"moved file -> {new_rel}")
            elif os.path.isfile(new_abs):
                print(f"already at -> {new_rel}")
            else:
                print(f"missing file for row {rid}: {src}")

            db.execute(
                text(
                    "UPDATE datasets.uploads "
                    "SET relative_path = :r, absolute_path = :a, user_role = :role "
                    "WHERE id = :id"
                ),
                {"r": new_rel, "a": new_abs, "role": role, "id": rid},
            )

        # Move leftover username-only folders under Upload/
        if os.path.isdir(UPLOAD_ROOT):
            for name in os.listdir(UPLOAD_ROOT):
                path = os.path.join(UPLOAD_ROOT, name)
                if not os.path.isdir(path):
                    continue
                if name in {
                    "Admin",
                    "CDO",
                    "Data_Steward",
                    "Data_Owner",
                    "Developer",
                    "Auditor",
                    "Analyst",
                    "Business_User",
                }:
                    continue
                dest_parent = os.path.join(UPLOAD_ROOT, "Data_Owner")
                dest = os.path.join(dest_parent, name)
                os.makedirs(dest_parent, exist_ok=True)
                if not os.path.exists(dest):
                    shutil.move(path, dest)
                    print(f"moved folder {name} -> Data_Owner/{name}")

        db.commit()
        print("migration done")
    finally:
        db.close()


if __name__ == "__main__":
    main()
