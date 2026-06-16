-- Production migration: bu_20260519 (business-user / enterprise dataset extensions)
-- Run against Render PostgreSQL when enterprise.datasets lacks job_id and related columns.
-- Safe to re-run (idempotent).

BEGIN;

-- --- enterprise.datasets (extends ent_20260512 base table) ---
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS job_id INTEGER;
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS tier VARCHAR(32);
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS record_count_label VARCHAR(64);
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS pii BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS steward_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS ix_enterprise_datasets_job_id ON enterprise.datasets (job_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_enterprise_datasets_job_id'
          AND conrelid = 'enterprise.datasets'::regclass
    ) THEN
        ALTER TABLE enterprise.datasets
            ADD CONSTRAINT fk_enterprise_datasets_job_id
            FOREIGN KEY (job_id) REFERENCES metadata.jobs (job_id);
    END IF;
END $$;

-- --- enterprise.glossary ---
ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS related_terms JSONB;
ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS owner_user_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_enterprise_glossary_owner'
          AND conrelid = 'enterprise.glossary'::regclass
    ) THEN
        ALTER TABLE enterprise.glossary
            ADD CONSTRAINT fk_enterprise_glossary_owner
            FOREIGN KEY (owner_user_id) REFERENCES auth.users (id);
    END IF;
END $$;

-- --- enterprise.business_reports (new table in bu_20260519) ---
CREATE TABLE IF NOT EXISTS enterprise.business_reports (
    id SERIAL NOT NULL,
    title VARCHAR(255) NOT NULL,
    report_type VARCHAR(64) NOT NULL,
    dataset_name VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'Certified',
    quality_score INTEGER,
    last_refreshed_label VARCHAR(64),
    external_url VARCHAR(512),
    user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_business_reports_user_id
    ON enterprise.business_reports (user_id);

-- --- enterprise.alert_subscriptions (new table in bu_20260519) ---
CREATE TABLE IF NOT EXISTS enterprise.alert_subscriptions (
    id SERIAL NOT NULL,
    user_id INTEGER NOT NULL,
    dataset_name VARCHAR(255) NOT NULL,
    threshold INTEGER NOT NULL DEFAULT 85,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_alert_subscriptions_user
    ON enterprise.alert_subscriptions (user_id);

COMMIT;

-- Verify (optional):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'enterprise' AND table_name = 'datasets' ORDER BY 1;
