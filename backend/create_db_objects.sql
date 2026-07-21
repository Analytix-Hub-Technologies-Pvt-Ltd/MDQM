-- Generated PostgreSQL DDL for MDQM backend
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS enterprise;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS metadata;
CREATE SCHEMA IF NOT EXISTS quarantine;
CREATE SCHEMA IF NOT EXISTS datasets;
CREATE SCHEMA IF NOT EXISTS dataset_source;
CREATE SCHEMA IF NOT EXISTS data_source;

CREATE TABLE metadata.jobs (
	job_id SERIAL NOT NULL, 
	job_name TEXT, 
	status TEXT, 
	start_time TIMESTAMP WITHOUT TIME ZONE, 
	end_time TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	db_source_config JSON, 
	source_kind TEXT, 
	source_connection_id INTEGER, 
	source_host TEXT, 
	source_port TEXT, 
	source_db_user TEXT, 
	source_dbname TEXT, 
	source_db_type TEXT, 
	source_schema_name TEXT, 
	source_table_names TEXT, 
	source_selected_columns TEXT, 
	source_encrypted_db_pass TEXT, 
	PRIMARY KEY (job_id)
);

CREATE TABLE metadata.table_metadata (
	job_id INTEGER NOT NULL, 
	table_id INTEGER NOT NULL, 
	table_name TEXT, 
	row_count INTEGER, 
	data_updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (job_id, table_id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE metadata.column_metadata (
	column_id SERIAL NOT NULL, 
	job_id INTEGER, 
	table_id INTEGER, 
	column_name TEXT, 
	data_type TEXT, 
	description TEXT, 
	description_generated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (column_id), 
	FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE metadata.dataset_rows (
	id BIGSERIAL NOT NULL, 
	job_id INTEGER NOT NULL, 
	table_id INTEGER NOT NULL, 
	row_index INTEGER NOT NULL, 
	row_data JSON NOT NULL, 
	is_golden_record BOOLEAN NOT NULL, 
	dq_remarks TEXT, 
	golden_remarks TEXT, 
	PRIMARY KEY (id), 
	FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id), 
	CONSTRAINT uq_metadata_dataset_rows_job_table_row UNIQUE (job_id, table_id, row_index)
);

CREATE TABLE metadata.dataset_row_cells (
	id BIGSERIAL NOT NULL, 
	job_id INTEGER NOT NULL, 
	table_id INTEGER NOT NULL, 
	row_index INTEGER NOT NULL, 
	column_name TEXT NOT NULL, 
	value_text TEXT, 
	dq_passed BOOLEAN, 
	dq_remark TEXT, 
	PRIMARY KEY (id), 
	FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id), 
	CONSTRAINT uq_metadata_dataset_row_cells_job_table_row_col UNIQUE (job_id, table_id, row_index, column_name)
);

CREATE TABLE metadata.dataset_base_backup_rows (
	id BIGSERIAL NOT NULL, 
	job_id INTEGER NOT NULL, 
	row_index INTEGER NOT NULL, 
	row_data JSON NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_metadata_dataset_base_backup_job_row UNIQUE (job_id, row_index), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE metadata.dataset_physical_tables (
	id SERIAL NOT NULL, 
	job_id INTEGER NOT NULL, 
	table_id INTEGER NOT NULL, 
	physical_table_name TEXT NOT NULL, 
	schema_name TEXT NOT NULL, 
	column_names TEXT[] NOT NULL, 
	row_count INTEGER NOT NULL, 
	has_base_backup BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_metadata_dataset_physical_tables_job_table UNIQUE (job_id, table_id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE metadata.rules (
	rule_id SERIAL NOT NULL, 
	job_id INTEGER, 
	table_id INTEGER, 
	column_name TEXT, 
	data_type TEXT, 
	rule_type TEXT, 
	rule_value TEXT, 
	is_active BOOLEAN, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (rule_id), 
	FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE metadata.table_stats (
	stat_id SERIAL NOT NULL, 
	job_id INTEGER, 
	table_id INTEGER, 
	table_name TEXT, 
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

CREATE TABLE quarantine.logs (
	log_id SERIAL NOT NULL, 
	job_id INTEGER, 
	table_name TEXT, 
	row_id INTEGER, 
	column_name TEXT, 
	error_type TEXT, 
	error_value TEXT, 
	description TEXT, 
	fuzzy_score INTEGER, 
	master_match TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (log_id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE metadata.master_tables (
	id SERIAL NOT NULL, 
	job_id INTEGER, 
	table_id INTEGER, 
	table_name TEXT, 
	master_value TEXT, 
	PRIMARY KEY (id), 
	FOREIGN KEY(job_id, table_id) REFERENCES metadata.table_metadata (job_id, table_id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE metadata.db_connections (
	connection_id SERIAL NOT NULL, 
	connection_name TEXT NOT NULL, 
	host TEXT NOT NULL, 
	port TEXT, 
	username TEXT NOT NULL, 
	password TEXT, 
	user_id INTEGER, 
	db_type TEXT, 
	dbname TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (connection_id), 
	CONSTRAINT uq_db_connections_name_user UNIQUE (connection_name, user_id), 
	FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE TABLE metadata.db_connection_shares (
	share_id SERIAL NOT NULL, 
	connection_id INTEGER NOT NULL, 
	shared_user_id INTEGER NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (share_id), 
	CONSTRAINT uq_db_connection_shares UNIQUE (connection_id, shared_user_id), 
	FOREIGN KEY(connection_id) REFERENCES metadata.db_connections (connection_id), 
	FOREIGN KEY(shared_user_id) REFERENCES auth.users (id)
);

CREATE TABLE auth.users (
	id SERIAL NOT NULL, 
	full_name TEXT NOT NULL, 
	username TEXT, 
	email TEXT NOT NULL, 
	password_hash TEXT NOT NULL, 
	role TEXT NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	created_by INTEGER, 
	invite_token_hash TEXT, 
	invite_expires_at TIMESTAMP WITHOUT TIME ZONE, 
	password_configured BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by) REFERENCES auth.users (id)
);

CREATE TABLE auth.access_requests (
	id SERIAL NOT NULL, 
	full_name TEXT NOT NULL, 
	username TEXT, 
	email TEXT NOT NULL, 
	department TEXT, 
	reason TEXT, 
	status TEXT NOT NULL, 
	requested_at TIMESTAMP WITHOUT TIME ZONE, 
	dataset_name TEXT, 
	access_type TEXT, 
	duration TEXT, 
	approver_name TEXT, 
	PRIMARY KEY (id)
);

CREATE TABLE auth.roles (
	id SERIAL NOT NULL, 
	name TEXT NOT NULL, 
	description TEXT, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE TABLE auth.permissions (
	id SERIAL NOT NULL, 
	code TEXT NOT NULL, 
	description TEXT, 
	PRIMARY KEY (id), 
	UNIQUE (code)
);

CREATE TABLE auth.role_permissions (
	id SERIAL NOT NULL, 
	role_id INTEGER NOT NULL, 
	permission_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(role_id) REFERENCES auth.roles (id), 
	FOREIGN KEY(permission_id) REFERENCES auth.permissions (id)
);

CREATE TABLE governance.audit_logs (
	id SERIAL NOT NULL, 
	user_id INTEGER, 
	action TEXT NOT NULL, 
	entity_type TEXT, 
	entity_id TEXT, 
	ip_address TEXT, 
	old_values TEXT, 
	new_values TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE TABLE governance.governance_policies (
	id SERIAL NOT NULL, 
	policy_name TEXT NOT NULL, 
	domain TEXT, 
	status TEXT NOT NULL, 
	owner_user_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_user_id) REFERENCES auth.users (id)
);

CREATE TABLE governance.stewardship_tasks (
	id SERIAL NOT NULL, 
	dataset_name TEXT NOT NULL, 
	assigned_to_user_id INTEGER, 
	status TEXT NOT NULL, 
	severity TEXT NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(assigned_to_user_id) REFERENCES auth.users (id)
);

CREATE TABLE governance.lineage_nodes (
	id SERIAL NOT NULL, 
	node_key TEXT NOT NULL, 
	node_type TEXT NOT NULL, 
	domain TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (node_key)
);

CREATE TABLE governance.lineage_edges (
	id SERIAL NOT NULL, 
	from_node_id INTEGER NOT NULL, 
	to_node_id INTEGER NOT NULL, 
	relation_type TEXT NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(from_node_id) REFERENCES governance.lineage_nodes (id), 
	FOREIGN KEY(to_node_id) REFERENCES governance.lineage_nodes (id)
);

CREATE TABLE governance.dataset_access (
	id SERIAL NOT NULL, 
	dataset_name TEXT NOT NULL, 
	user_id INTEGER NOT NULL, 
	access_level TEXT NOT NULL, 
	pii_allowed BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE TABLE governance.workflow_approvals (
	id SERIAL NOT NULL, 
	request_type TEXT NOT NULL, 
	request_ref TEXT NOT NULL, 
	owner_user_id INTEGER, 
	status TEXT NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.schedules (
	id SERIAL NOT NULL, 
	job_id INTEGER NOT NULL, 
	name TEXT NOT NULL, 
	schedule_type TEXT NOT NULL, 
	cron_expression TEXT, 
	interval_minutes INTEGER, 
	is_active BOOLEAN NOT NULL, 
	created_by_user_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id), 
	FOREIGN KEY(created_by_user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.schedule_runs (
	id SERIAL NOT NULL, 
	schedule_id INTEGER, 
	job_id INTEGER NOT NULL, 
	status TEXT NOT NULL, 
	message TEXT, 
	started_at TIMESTAMP WITHOUT TIME ZONE, 
	finished_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(schedule_id) REFERENCES enterprise.schedules (id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE enterprise.api_logs (
	id SERIAL NOT NULL, 
	method TEXT NOT NULL, 
	path TEXT NOT NULL, 
	status_code INTEGER, 
	duration_ms INTEGER, 
	user_id INTEGER, 
	correlation_id TEXT, 
	ip_address TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.validation_results (
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

CREATE TABLE enterprise.quarantine_records (
	id SERIAL NOT NULL, 
	job_id INTEGER NOT NULL, 
	table_name TEXT NOT NULL, 
	open_issues INTEGER NOT NULL, 
	last_error_type TEXT, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id)
);

CREATE TABLE enterprise.access_logs (
	id SERIAL NOT NULL, 
	user_id INTEGER, 
	resource TEXT NOT NULL, 
	action TEXT NOT NULL, 
	ip_address TEXT, 
	meta JSON, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.compliance_reports (
	id SERIAL NOT NULL, 
	title TEXT NOT NULL, 
	framework TEXT NOT NULL, 
	status TEXT NOT NULL, 
	body TEXT, 
	created_by_user_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by_user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.datasets (
	id SERIAL NOT NULL, 
	name TEXT NOT NULL, 
	domain TEXT, 
	owner_user_id INTEGER, 
	job_id INTEGER, 
	classification TEXT, 
	description TEXT, 
	tier TEXT, 
	quality_score INTEGER, 
	record_count_label TEXT, 
	pii BOOLEAN NOT NULL, 
	steward_name TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	purge_at TIMESTAMP WITHOUT TIME ZONE, 
	deleted_by_user_id INTEGER, 
	PRIMARY KEY (id), 
	UNIQUE (name), 
	FOREIGN KEY(owner_user_id) REFERENCES auth.users (id), 
	FOREIGN KEY(job_id) REFERENCES metadata.jobs (job_id), 
	FOREIGN KEY(deleted_by_user_id) REFERENCES auth.users (id)
);

CREATE TABLE dataset_source.dataset_source (
	id SERIAL NOT NULL,
	enterprise_dataset_id INTEGER NOT NULL,
	dataset_name TEXT NOT NULL,
	description TEXT,
	created_by_user_id INTEGER,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (enterprise_dataset_id),
	FOREIGN KEY(enterprise_dataset_id) REFERENCES enterprise.datasets (id),
	FOREIGN KEY(created_by_user_id) REFERENCES auth.users (id)
);

CREATE TABLE data_source.data_sources (
	id SERIAL NOT NULL,
	dataset_id INTEGER NOT NULL,
	source_type TEXT NOT NULL,
	db_connection_id INTEGER,
	data_source_name TEXT NOT NULL,
	join_configuration JSON,
	mapping_config JSON,
	created_by INTEGER,
	created_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(dataset_id) REFERENCES enterprise.datasets (id),
	FOREIGN KEY(created_by) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.glossary (
	id SERIAL NOT NULL, 
	term TEXT NOT NULL, 
	definition TEXT NOT NULL, 
	domain TEXT, 
	status TEXT NOT NULL, 
	tags JSON, 
	related_terms JSON, 
	owner_user_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.business_reports (
	id SERIAL NOT NULL, 
	title TEXT NOT NULL, 
	report_type TEXT NOT NULL, 
	dataset_name TEXT, 
	status TEXT NOT NULL, 
	quality_score INTEGER, 
	last_refreshed_label TEXT, 
	external_url TEXT, 
	user_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.alert_subscriptions (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	dataset_name TEXT NOT NULL, 
	threshold INTEGER NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.policies (
	id SERIAL NOT NULL, 
	policy_name TEXT NOT NULL, 
	domain TEXT, 
	status TEXT NOT NULL, 
	content TEXT, 
	owner_user_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.analytics_metrics (
	id SERIAL NOT NULL, 
	metric_key TEXT NOT NULL, 
	metric_value JSON NOT NULL, 
	domain TEXT, 
	captured_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE enterprise.notifications (
	id SERIAL NOT NULL, 
	user_id INTEGER, 
	channel TEXT NOT NULL, 
	subject TEXT NOT NULL, 
	body TEXT, 
	severity TEXT NOT NULL, 
	read_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES auth.users (id)
);

CREATE TABLE enterprise.report_exports (
	id SERIAL NOT NULL, 
	report_type TEXT NOT NULL, 
	format TEXT NOT NULL, 
	payload JSON, 
	created_by_user_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by_user_id) REFERENCES auth.users (id)
);

CREATE TABLE metadata.golden_merge_candidates (
	id SERIAL NOT NULL, 
	dataset_id INTEGER NOT NULL, 
	row_group_key TEXT NOT NULL, 
	source_values JSON NOT NULL, 
	column_scores JSON NOT NULL, 
	row_score NUMERIC NOT NULL, 
	status TEXT NOT NULL, 
	golden_values JSON, 
	resolved_by_user_id INTEGER, 
	resolved_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	merge_config_snapshot JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(dataset_id) REFERENCES enterprise.datasets (id), 
	FOREIGN KEY(resolved_by_user_id) REFERENCES auth.users (id)
);

CREATE TABLE metadata.golden_merge_configs (
	id SERIAL NOT NULL, 
	dataset_id INTEGER NOT NULL, 
	source_priority JSON NOT NULL, 
	auto_merge_threshold NUMERIC NOT NULL, 
	review_threshold NUMERIC NOT NULL, 
	column_overrides JSON NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (dataset_id), 
	FOREIGN KEY(dataset_id) REFERENCES enterprise.datasets (id)
);

