-- Generated PostgreSQL DDL for MDQM backend required schemas and tables
-- Derived from backend SQLAlchemy models and migration scripts

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS enterprise;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS metadata;
CREATE SCHEMA IF NOT EXISTS quarantine;

CREATE TABLE IF NOT EXISTS auth.access_requests (
    id SERIAL NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(64),
    email VARCHAR(320) NOT NULL,
    department VARCHAR(255),
    reason TEXT,
    status VARCHAR(32) NOT NULL,
    requested_at TIMESTAMP WITHOUT TIME ZONE,
    dataset_name VARCHAR(255),
    access_type VARCHAR(32),
    duration VARCHAR(64),
    approver_name VARCHAR(255),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_auth_access_requests_email ON auth.access_requests (email);
CREATE INDEX IF NOT EXISTS ix_auth_access_requests_id ON auth.access_requests (id);
CREATE INDEX IF NOT EXISTS ix_auth_access_requests_username ON auth.access_requests (username);

CREATE TABLE IF NOT EXISTS auth.permissions (
    id SERIAL NOT NULL,
    code VARCHAR(128) NOT NULL,
    description TEXT,
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS ix_auth_permissions_id ON auth.permissions (id);

CREATE TABLE IF NOT EXISTS auth.roles (
    id SERIAL NOT NULL,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    PRIMARY KEY (id),
    UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS ix_auth_roles_id ON auth.roles (id);

CREATE TABLE IF NOT EXISTS auth.users (
    id SERIAL NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(64),
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    is_active BOOLEAN NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    created_by INTEGER,
    invite_token_hash VARCHAR(128),
    invite_expires_at TIMESTAMP WITHOUT TIME ZONE,
    password_configured BOOLEAN NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(created_by) REFERENCES auth.users (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_auth_users_email ON auth.users (email);
CREATE INDEX IF NOT EXISTS ix_auth_users_id ON auth.users (id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_auth_users_username ON auth.users (username);

CREATE TABLE IF NOT EXISTS enterprise.analytics_metrics (
    id SERIAL NOT NULL,
    metric_key VARCHAR(128) NOT NULL,
    metric_value JSON NOT NULL,
    domain VARCHAR(128),
    captured_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_analytics_metrics_captured_at ON enterprise.analytics_metrics (captured_at);
CREATE INDEX IF NOT EXISTS ix_enterprise_analytics_metrics_domain ON enterprise.analytics_metrics (domain);
CREATE INDEX IF NOT EXISTS ix_enterprise_analytics_metrics_metric_key ON enterprise.analytics_metrics (metric_key);

CREATE TABLE IF NOT EXISTS governance.lineage_nodes (
    id SERIAL NOT NULL,
    node_key VARCHAR(255) NOT NULL,
    node_type VARCHAR(64) NOT NULL,
    domain VARCHAR(128),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (node_key)
);

CREATE INDEX IF NOT EXISTS ix_governance_lineage_nodes_id ON governance.lineage_nodes (id);

CREATE TABLE IF NOT EXISTS metadata.db_connections (
    connection_id SERIAL NOT NULL,
    connection_name VARCHAR NOT NULL,
    host VARCHAR NOT NULL,
    port VARCHAR,
    username VARCHAR NOT NULL,
    password VARCHAR,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (connection_id),
    UNIQUE (connection_name)
);

CREATE INDEX IF NOT EXISTS ix_metadata_db_connections_connection_id ON metadata.db_connections (connection_id);

CREATE TABLE IF NOT EXISTS metadata.jobs (
    job_id SERIAL NOT NULL,
    job_name VARCHAR,
    status VARCHAR,
    start_time TIMESTAMP WITHOUT TIME ZONE,
    end_time TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (job_id)
);

CREATE INDEX IF NOT EXISTS ix_metadata_jobs_job_id ON metadata.jobs (job_id);

CREATE TABLE IF NOT EXISTS auth.role_permissions (
    id SERIAL NOT NULL,
    role_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(role_id) REFERENCES auth.roles (id),
    FOREIGN KEY(permission_id) REFERENCES auth.permissions (id)
);

CREATE INDEX IF NOT EXISTS ix_auth_role_permissions_id ON auth.role_permissions (id);

CREATE TABLE IF NOT EXISTS enterprise.access_logs (
    id SERIAL NOT NULL,
    user_id INTEGER,
    resource VARCHAR(255) NOT NULL,
    action VARCHAR(128) NOT NULL,
    ip_address VARCHAR(64),
    meta JSON,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_access_logs_created_at ON enterprise.access_logs (created_at);
CREATE INDEX IF NOT EXISTS ix_enterprise_access_logs_resource ON enterprise.access_logs (resource);
CREATE INDEX IF NOT EXISTS ix_enterprise_access_logs_user_id ON enterprise.access_logs (user_id);

CREATE TABLE IF NOT EXISTS enterprise.alert_subscriptions (
    id SERIAL NOT NULL,
    user_id INTEGER NOT NULL,
    dataset_name VARCHAR(255) NOT NULL,
    threshold INTEGER NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_alert_subscriptions_user_id ON enterprise.alert_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS enterprise.api_logs (
    id SERIAL NOT NULL,
    method VARCHAR(16) NOT NULL,
    path VARCHAR(512) NOT NULL,
    status_code INTEGER,
    duration_ms INTEGER,
    user_id INTEGER,
    correlation_id VARCHAR(64),
    ip_address VARCHAR(64),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_api_logs_correlation_id ON enterprise.api_logs (correlation_id);
CREATE INDEX IF NOT EXISTS ix_enterprise_api_logs_created_at ON enterprise.api_logs (created_at);
CREATE INDEX IF NOT EXISTS ix_enterprise_api_logs_path ON enterprise.api_logs (path);
CREATE INDEX IF NOT EXISTS ix_enterprise_api_logs_user_id ON enterprise.api_logs (user_id);

CREATE TABLE IF NOT EXISTS enterprise.business_reports (
    id SERIAL NOT NULL,
    title VARCHAR(255) NOT NULL,
    report_type VARCHAR(64) NOT NULL,
    dataset_name VARCHAR(255),
    status VARCHAR(32) NOT NULL,
    quality_score INTEGER,
    last_refreshed_label VARCHAR(64),
    external_url VARCHAR(512),
    user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_business_reports_user_id ON enterprise.business_reports (user_id);

CREATE TABLE IF NOT EXISTS enterprise.compliance_reports (
    id SERIAL NOT NULL,
    title VARCHAR(255) NOT NULL,
    framework VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    body TEXT,
    created_by_user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(created_by_user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_compliance_reports_framework ON enterprise.compliance_reports (framework);
CREATE INDEX IF NOT EXISTS ix_enterprise_compliance_reports_status ON enterprise.compliance_reports (status);

CREATE TABLE IF NOT EXISTS enterprise.datasets (
    id SERIAL NOT NULL,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(128),
    owner_user_id INTEGER,
    job_id INTEGER,
    classification VARCHAR(64),
    description TEXT,
    tier VARCHAR(32),
    quality_score INTEGER,
    record_count_label VARCHAR(64),
    pii BOOLEAN NOT NULL,
    steward_name VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (name),
    FOREIGN KEY(owner_user_id) REFERENCES auth.users (id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_datasets_domain ON enterprise.datasets (domain);
CREATE INDEX IF NOT EXISTS ix_enterprise_datasets_job_id ON enterprise.datasets (job_id);
CREATE INDEX IF NOT EXISTS ix_enterprise_datasets_owner_user_id ON enterprise.datasets (owner_user_id);

CREATE TABLE IF NOT EXISTS enterprise.glossary (
    id SERIAL NOT NULL,
    term VARCHAR(255) NOT NULL,
    definition TEXT NOT NULL,
    domain VARCHAR(128),
    status VARCHAR(32) NOT NULL,
    tags JSON,
    related_terms JSON,
    owner_user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(owner_user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_glossary_domain ON enterprise.glossary (domain);
CREATE INDEX IF NOT EXISTS ix_enterprise_glossary_status ON enterprise.glossary (status);
CREATE INDEX IF NOT EXISTS ix_enterprise_glossary_term ON enterprise.glossary (term);

CREATE TABLE IF NOT EXISTS enterprise.notifications (
    id SERIAL NOT NULL,
    user_id INTEGER,
    channel VARCHAR(32) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT,
    severity VARCHAR(32) NOT NULL,
    read_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_notifications_created_at ON enterprise.notifications (created_at);
CREATE INDEX IF NOT EXISTS ix_enterprise_notifications_user_id ON enterprise.notifications (user_id);

CREATE TABLE IF NOT EXISTS enterprise.policies (
    id SERIAL NOT NULL,
    policy_name VARCHAR(255) NOT NULL,
    domain VARCHAR(128),
    status VARCHAR(32) NOT NULL,
    content TEXT,
    owner_user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(owner_user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_policies_domain ON enterprise.policies (domain);
CREATE INDEX IF NOT EXISTS ix_enterprise_policies_status ON enterprise.policies (status);

CREATE TABLE IF NOT EXISTS enterprise.quarantine_records (
    id SERIAL NOT NULL,
    job_id INTEGER NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    open_issues INTEGER NOT NULL,
    last_error_type VARCHAR(128),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_quarantine_records_job_id ON enterprise.quarantine_records (job_id);

CREATE TABLE IF NOT EXISTS enterprise.report_exports (
    id SERIAL NOT NULL,
    report_type VARCHAR(64) NOT NULL,
    format VARCHAR(16) NOT NULL,
    payload JSON,
    created_by_user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(created_by_user_id) REFERENCES auth.users (id)
);

CREATE TABLE IF NOT EXISTS enterprise.schedules (
    id SERIAL NOT NULL,
    job_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    schedule_type VARCHAR(32) NOT NULL,
    cron_expression VARCHAR(128),
    interval_minutes INTEGER,
    is_active BOOLEAN NOT NULL,
    created_by_user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id),
    FOREIGN KEY(created_by_user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_schedules_job_id ON enterprise.schedules (job_id);

CREATE TABLE IF NOT EXISTS enterprise.validation_results (
    id SERIAL NOT NULL,
    job_id INTEGER NOT NULL,
    table_id INTEGER,
    passed BOOLEAN NOT NULL,
    summary TEXT,
    details JSON,
    created_by_user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id),
    FOREIGN KEY(created_by_user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_validation_results_created_at ON enterprise.validation_results (created_at);
CREATE INDEX IF NOT EXISTS ix_enterprise_validation_results_job_id ON enterprise.validation_results (job_id);
CREATE INDEX IF NOT EXISTS ix_enterprise_validation_results_table_id ON enterprise.validation_results (table_id);

CREATE TABLE IF NOT EXISTS governance.audit_logs (
    id SERIAL NOT NULL,
    user_id INTEGER,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(128),
    entity_id VARCHAR(128),
    ip_address VARCHAR(64),
    old_values TEXT,
    new_values TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_governance_audit_logs_id ON governance.audit_logs (id);
CREATE INDEX IF NOT EXISTS ix_governance_audit_logs_user_id ON governance.audit_logs (user_id);

CREATE TABLE IF NOT EXISTS governance.dataset_access (
    id SERIAL NOT NULL,
    dataset_name VARCHAR(255) NOT NULL,
    user_id INTEGER NOT NULL,
    access_level VARCHAR(32) NOT NULL,
    pii_allowed BOOLEAN NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_governance_dataset_access_dataset_name ON governance.dataset_access (dataset_name);
CREATE INDEX IF NOT EXISTS ix_governance_dataset_access_id ON governance.dataset_access (id);
CREATE INDEX IF NOT EXISTS ix_governance_dataset_access_user_id ON governance.dataset_access (user_id);

CREATE TABLE IF NOT EXISTS governance.governance_policies (
    id SERIAL NOT NULL,
    policy_name VARCHAR(255) NOT NULL,
    domain VARCHAR(128),
    status VARCHAR(64) NOT NULL,
    owner_user_id INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(owner_user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_governance_governance_policies_domain ON governance.governance_policies (domain);
CREATE INDEX IF NOT EXISTS ix_governance_governance_policies_id ON governance.governance_policies (id);

CREATE TABLE IF NOT EXISTS governance.lineage_edges (
    id SERIAL NOT NULL,
    from_node_id INTEGER NOT NULL,
    to_node_id INTEGER NOT NULL,
    relation_type VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(from_node_id) REFERENCES governance.lineage_nodes (id),
    FOREIGN KEY(to_node_id) REFERENCES governance.lineage_nodes (id)
);

CREATE INDEX IF NOT EXISTS ix_governance_lineage_edges_id ON governance.lineage_edges (id);

CREATE TABLE IF NOT EXISTS governance.stewardship_tasks (
    id SERIAL NOT NULL,
    dataset_name VARCHAR(255) NOT NULL,
    assigned_to_user_id INTEGER,
    status VARCHAR(64) NOT NULL,
    severity VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(assigned_to_user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_governance_stewardship_tasks_id ON governance.stewardship_tasks (id);

CREATE TABLE IF NOT EXISTS governance.workflow_approvals (
    id SERIAL NOT NULL,
    request_type VARCHAR(128) NOT NULL,
    request_ref VARCHAR(128) NOT NULL,
    owner_user_id INTEGER,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(owner_user_id) REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS ix_governance_workflow_approvals_id ON governance.workflow_approvals (id);

CREATE TABLE IF NOT EXISTS metadata.table_metadata (
    job_id INTEGER NOT NULL,
    table_id INTEGER NOT NULL,
    table_name VARCHAR,
    row_count INTEGER,
    PRIMARY KEY (job_id, table_id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE IF NOT EXISTS quarantine.logs (
    log_id SERIAL NOT NULL,
    job_id INTEGER,
    table_name VARCHAR,
    row_id INTEGER,
    column_name VARCHAR,
    error_type VARCHAR,
    error_value TEXT,
    description TEXT,
    fuzzy_score INTEGER,
    master_match VARCHAR,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (log_id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE IF NOT EXISTS enterprise.schedule_runs (
    id SERIAL NOT NULL,
    schedule_id INTEGER,
    job_id INTEGER NOT NULL,
    status VARCHAR(32) NOT NULL,
    message TEXT,
    started_at TIMESTAMP WITHOUT TIME ZONE,
    finished_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(schedule_id) REFERENCES enterprise.schedules (id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE INDEX IF NOT EXISTS ix_enterprise_schedule_runs_job_id ON enterprise.schedule_runs (job_id);
CREATE INDEX IF NOT EXISTS ix_enterprise_schedule_runs_schedule_id ON enterprise.schedule_runs (schedule_id);
CREATE INDEX IF NOT EXISTS ix_enterprise_schedule_runs_status ON enterprise.schedule_runs (status);

CREATE TABLE IF NOT EXISTS metadata.column_metadata (
    column_id SERIAL NOT NULL,
    job_id INTEGER,
    table_id INTEGER,
    column_name VARCHAR,
    data_type VARCHAR,
    description TEXT,
    description_generated_at TIMESTAMPTZ,
    PRIMARY KEY (column_id),
    FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE IF NOT EXISTS metadata.master_tables (
    id SERIAL NOT NULL,
    job_id INTEGER,
    table_id INTEGER,
    table_name VARCHAR,
    master_value VARCHAR,
    PRIMARY KEY (id),
    FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE IF NOT EXISTS metadata.rules (
    rule_id SERIAL NOT NULL,
    job_id INTEGER,
    table_id INTEGER,
    column_name VARCHAR,
    data_type VARCHAR,
    rule_type VARCHAR,
    rule_value TEXT,
    is_active BOOLEAN,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (rule_id),
    FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE IF NOT EXISTS metadata.table_stats (
    stat_id SERIAL NOT NULL,
    job_id INTEGER,
    table_id INTEGER,
    table_name VARCHAR,
    start_time TIMESTAMP WITHOUT TIME ZONE,
    end_time TIMESTAMP WITHOUT TIME ZONE,
    total_rows INTEGER,
    validation_errors INTEGER,
    fuzzy_errors INTEGER,
    good_rows INTEGER,
    PRIMARY KEY (stat_id),
    FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id),
    FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);
