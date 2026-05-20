-- Run in pgAdmin or psql if alembic is not installed.
-- Adds business-user columns missing from enterprise.datasets

ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES metadata.jobs(job_id);
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS tier VARCHAR(32);
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS record_count_label VARCHAR(64);
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS pii BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS steward_name VARCHAR(255);

ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS related_terms JSONB;
ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES auth.users(id);
