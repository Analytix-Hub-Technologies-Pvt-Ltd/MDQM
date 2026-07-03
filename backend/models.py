from sqlalchemy import Numeric, BigInteger, Column, Integer, Text, Boolean, ForeignKey, DateTime, Text, ForeignKeyConstraint, JSON, UniqueConstraint, Numeric
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = {'schema': 'metadata'}

    job_id = Column(Integer, primary_key=True, index=True)
    job_name = Column(Text)
    status = Column(Text, default="Pending")
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    created_at = Column(DateTime, default=func.now())
    """Legacy JSON snapshot — use relational source_* columns instead."""
    db_source_config = Column(JSON, nullable=True)
    source_kind = Column(Text, nullable=True)
    source_connection_id = Column(Integer, nullable=True)
    source_host = Column(Text, nullable=True)
    source_port = Column(Text, nullable=True)
    source_db_user = Column(Text, nullable=True)
    source_dbname = Column(Text, nullable=True)
    source_db_type = Column(Text, nullable=True)
    source_schema_name = Column(Text, nullable=True)
    source_table_names = Column(Text, nullable=True)
    source_selected_columns = Column(Text, nullable=True)
    source_encrypted_db_pass = Column(Text, nullable=True)

    tables = relationship("TableMetadata", back_populates="job")
    # FIX: Added overlaps to silence warning
    rules = relationship("Rule", back_populates="job", overlaps="table,rules")

class TableMetadata(Base):
    __tablename__ = "table_metadata"
    __table_args__ = {'schema': 'metadata'}

    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), primary_key=True)
    table_id = Column(Integer, primary_key=True) 
    
    table_name = Column(Text)
    row_count = Column(Integer, default=0)
    data_updated_at = Column(DateTime, nullable=True)

    job = relationship("Job", back_populates="tables")
    columns = relationship("ColumnMetadata", back_populates="table", cascade="all, delete-orphan")
    # FIX: Added overlaps to silence warning
    rules = relationship("Rule", back_populates="table", cascade="all, delete-orphan", overlaps="job,rules")

class ColumnMetadata(Base):
    __tablename__ = "column_metadata"
    __table_args__ = (
        ForeignKeyConstraint(['job_id', 'table_id'], ['metadata.table_metadata.job_id', 'metadata.table_metadata.table_id']),
        {'schema': 'metadata'}
    )

    column_id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id")) 
    table_id = Column(Integer)
    column_name = Column(Text)
    data_type = Column(Text)
    description = Column(Text, nullable=True)
    description_generated_at = Column(DateTime, nullable=True)

    table = relationship("TableMetadata", back_populates="columns")


class DatasetRow(Base):
    """Ingested dataset row snapshot (replaces uploads/job_*/table.csv for new data)."""
    __tablename__ = "dataset_rows"
    __table_args__ = (
        ForeignKeyConstraint(
            ["job_id", "table_id"],
            ["metadata.table_metadata.job_id", "metadata.table_metadata.table_id"],
        ),
        UniqueConstraint("job_id", "table_id", "row_index", name="uq_metadata_dataset_rows_job_table_row"),
        {"schema": "metadata"},
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id = Column(Integer, nullable=False, index=True)
    table_id = Column(Integer, nullable=False)
    row_index = Column(Integer, nullable=False)
    row_data = Column(JSON, nullable=False)
    is_golden_record = Column(Boolean, nullable=False, default=False)
    dq_remarks = Column(Text, nullable=True)
    golden_remarks = Column(Text, nullable=True)


class DatasetRowCell(Base):
    """Per-column cell storage (CSV/DB style) with optional DQ pass flag and remark."""
    __tablename__ = "dataset_row_cells"
    __table_args__ = (
        ForeignKeyConstraint(
            ["job_id", "table_id"],
            ["metadata.table_metadata.job_id", "metadata.table_metadata.table_id"],
        ),
        UniqueConstraint(
            "job_id", "table_id", "row_index", "column_name",
            name="uq_metadata_dataset_row_cells_job_table_row_col",
        ),
        {"schema": "metadata"},
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id = Column(Integer, nullable=False, index=True)
    table_id = Column(Integer, nullable=False)
    row_index = Column(Integer, nullable=False)
    column_name = Column(Text, nullable=False)
    value_text = Column(Text, nullable=True)
    dq_passed = Column(Boolean, nullable=True)
    dq_remark = Column(Text, nullable=True)


class DatasetBaseBackupRow(Base):
    """Pre-join primary snapshot backup (one per job)."""
    __tablename__ = "dataset_base_backup_rows"
    __table_args__ = (
        UniqueConstraint("job_id", "row_index", name="uq_metadata_dataset_base_backup_job_row"),
        {"schema": "metadata"},
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=False, index=True)
    row_index = Column(Integer, nullable=False)
    row_data = Column(JSON, nullable=False)


class DatasetPhysicalTable(Base):
    """Registry: one row per physical per-dataset table in the 'datasets' schema."""
    __tablename__ = "dataset_physical_tables"
    __table_args__ = (
        UniqueConstraint("job_id", "table_id", name="uq_metadata_dataset_physical_tables_job_table"),
        {"schema": "metadata"},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=False, index=True)
    table_id = Column(Integer, nullable=False, index=True)
    # Fully-qualified physical table name (without schema), e.g. 'job_1_tbl_2'
    physical_table_name = Column(Text, nullable=False)
    schema_name = Column(Text, nullable=False, default="datasets")
    # Ordered list of user-data column names (as stored in the physical table)
    column_names = Column(PG_ARRAY(Text), nullable=False, default=list)
    row_count = Column(Integer, nullable=False, default=0)
    # Whether a pre-join base backup physical table also exists
    has_base_backup = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)




class Rule(Base):
    __tablename__ = "rules"
    __table_args__ = (
        ForeignKeyConstraint(['job_id', 'table_id'], ['metadata.table_metadata.job_id', 'metadata.table_metadata.table_id']),
        {'schema': 'metadata'}
    )

    rule_id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"))
    table_id = Column(Integer)
    
    column_name = Column(Text)
    data_type = Column(Text)
    rule_type = Column(Text)
    rule_value = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())

    # FIX: Added overlaps to silence warning
    table = relationship("TableMetadata", back_populates="rules", overlaps="job,rules")
    job = relationship("Job", back_populates="rules", overlaps="table,rules")

class TableStats(Base):
    __tablename__ = "table_stats"
    __table_args__ = (
        ForeignKeyConstraint(['job_id', 'table_id'], ['metadata.table_metadata.job_id', 'metadata.table_metadata.table_id']),
        {'schema': 'metadata'}
    )

    stat_id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"))
    table_id = Column(Integer)
    
    table_name = Column(Text)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    total_rows = Column(Integer, default=0)
    validation_errors = Column(Integer, default=0)
    fuzzy_errors = Column(Integer, default=0)
    good_rows = Column(Integer, default=0)
    
class QuarantineLog(Base):
    __tablename__ = "logs"
    __table_args__ = {'schema': 'quarantine'}

    log_id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"))
    table_name = Column(Text)
    row_id = Column(Integer)
    column_name = Column(Text)
    error_type = Column(Text) 
    error_value = Column(Text)
    description = Column(Text)
    fuzzy_score = Column(Integer, default=0)
    master_match = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

class MasterTable(Base):
    __tablename__ = "master_tables"
    __table_args__ = (
        # Link to specific Table in specific Job
        ForeignKeyConstraint(['job_id', 'table_id'], ['metadata.table_metadata.job_id', 'metadata.table_metadata.table_id']),
        {'schema': 'metadata'}
    )
    
    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id")) # <--- NEW
    table_id = Column(Integer) # <--- NEW
    
    table_name = Column(Text) 
    master_value = Column(Text)


class DbConnection(Base):
    __tablename__ = "db_connections"
    __table_args__ = (
        UniqueConstraint("connection_name", "user_id", name="uq_db_connections_name_user"),
        {'schema': 'metadata'},
    )

    connection_id = Column(Integer, primary_key=True, index=True)
    connection_name = Column(Text, nullable=False)
    host = Column(Text, nullable=False)
    port = Column(Text, default="5432")
    username = Column(Text, nullable=False)
    password = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    db_type = Column(Text, nullable=True, default="postgres")
    dbname = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())


class DbConnectionShare(Base):
    __tablename__ = "db_connection_shares"
    __table_args__ = (
        UniqueConstraint("connection_id", "shared_user_id", name="uq_db_connection_shares"),
        {'schema': 'metadata'},
    )

    share_id = Column(Integer, primary_key=True, index=True)
    connection_id = Column(Integer, ForeignKey("metadata.db_connections.connection_id"), nullable=False, index=True)
    shared_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=func.now())


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    full_name = Column(Text, nullable=False)
    username = Column(Text, unique=True, nullable=True, index=True)
    email = Column(Text, unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    role = Column(Text, nullable=False, default="user")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=func.now())
    created_by = Column(Integer, ForeignKey("auth.users.id"), nullable=True)

    # Invitation/password-setup architecture (email delivery not implemented yet)
    invite_token_hash = Column(Text, nullable=True)
    invite_expires_at = Column(DateTime, nullable=True)
    password_configured = Column(Boolean, nullable=False, default=True)


class AccessRequest(Base):
    __tablename__ = "access_requests"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    full_name = Column(Text, nullable=False)
    username = Column(Text, nullable=True, index=True)
    email = Column(Text, nullable=False, index=True)
    department = Column(Text, nullable=True)
    reason = Column(Text, nullable=True)
    status = Column(Text, nullable=False, default="pending")
    requested_at = Column(DateTime, default=func.now())
    # Extended data-access workflow (governance-style requests from logged-in users)
    dataset_name = Column(Text, nullable=True)
    access_type = Column(Text, nullable=True)
    duration = Column(Text, nullable=True)
    approver_name = Column(Text, nullable=True)


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(Text, unique=True, nullable=False)
    description = Column(Text, nullable=True)


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(Text, unique=True, nullable=False)
    description = Column(Text, nullable=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    role_id = Column(Integer, ForeignKey("auth.roles.id"), nullable=False)
    permission_id = Column(Integer, ForeignKey("auth.permissions.id"), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    action = Column(Text, nullable=False)
    entity_type = Column(Text, nullable=True)
    entity_id = Column(Text, nullable=True)
    ip_address = Column(Text, nullable=True)
    old_values = Column(Text, nullable=True)
    new_values = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class GovernancePolicy(Base):
    __tablename__ = "governance_policies"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    policy_name = Column(Text, nullable=False)
    domain = Column(Text, nullable=True, index=True)
    status = Column(Text, nullable=False, default="draft")
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class StewardshipTask(Base):
    __tablename__ = "stewardship_tasks"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    dataset_name = Column(Text, nullable=False)
    assigned_to_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    status = Column(Text, nullable=False, default="open")
    severity = Column(Text, nullable=False, default="medium")
    created_at = Column(DateTime, default=func.now(), nullable=False)


class LineageNode(Base):
    __tablename__ = "lineage_nodes"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    node_key = Column(Text, nullable=False, unique=True)
    node_type = Column(Text, nullable=False)
    domain = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class LineageEdge(Base):
    __tablename__ = "lineage_edges"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    from_node_id = Column(Integer, ForeignKey("governance.lineage_nodes.id"), nullable=False)
    to_node_id = Column(Integer, ForeignKey("governance.lineage_nodes.id"), nullable=False)
    relation_type = Column(Text, nullable=False, default="depends_on")
    created_at = Column(DateTime, default=func.now(), nullable=False)


class DatasetAccess(Base):
    __tablename__ = "dataset_access"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    dataset_name = Column(Text, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)
    access_level = Column(Text, nullable=False, default="read")
    pii_allowed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class WorkflowApproval(Base):
    __tablename__ = "workflow_approvals"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    request_type = Column(Text, nullable=False)
    request_ref = Column(Text, nullable=False)
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    status = Column(Text, nullable=False, default="pending")
    created_at = Column(DateTime, default=func.now(), nullable=False)


# --- Enterprise dashboard persistence (schema: enterprise) ---


class EnterpriseSchedule(Base):
    __tablename__ = "schedules"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=False, index=True)
    name = Column(Text, nullable=False)
    schedule_type = Column(Text, nullable=False, default="interval")
    cron_expression = Column(Text, nullable=True)
    interval_minutes = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class EnterpriseScheduleRun(Base):
    __tablename__ = "schedule_runs"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("enterprise.schedules.id"), nullable=True, index=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=False, index=True)
    status = Column(Text, nullable=False, default="queued", index=True)
    message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseApiLog(Base):
    __tablename__ = "api_logs"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    method = Column(Text, nullable=False)
    path = Column(Text, nullable=False, index=True)
    status_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    correlation_id = Column(Text, nullable=True, index=True)
    ip_address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False, index=True)


class EnterpriseValidationResult(Base):
    __tablename__ = "validation_results"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=False, index=True)
    table_id = Column(Integer, nullable=True, index=True)
    passed = Column(Boolean, nullable=False, default=True)
    summary = Column(Text, nullable=True)
    details = Column(JSON, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False, index=True)


class EnterpriseQuarantineRecord(Base):
    __tablename__ = "quarantine_records"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=False, index=True)
    table_name = Column(Text, nullable=False)
    open_issues = Column(Integer, nullable=False, default=0)
    last_error_type = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class EnterpriseAccessLog(Base):
    __tablename__ = "access_logs"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    resource = Column(Text, nullable=False, index=True)
    action = Column(Text, nullable=False)
    ip_address = Column(Text, nullable=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False, index=True)


class EnterpriseComplianceReport(Base):
    __tablename__ = "compliance_reports"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(Text, nullable=False)
    framework = Column(Text, nullable=False, index=True)
    status = Column(Text, nullable=False, default="draft", index=True)
    body = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseDataset(Base):
    __tablename__ = "datasets"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False, unique=True)
    domain = Column(Text, nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=True, index=True)
    classification = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    tier = Column(Text, nullable=True)
    quality_score = Column(Integer, nullable=True)
    record_count_label = Column(Text, nullable=True)
    pii = Column(Boolean, nullable=False, default=False)
    steward_name = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    deleted_at = Column(DateTime, nullable=True, index=True)
    purge_at = Column(DateTime, nullable=True, index=True)
    deleted_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)


class EnterpriseGlossaryTerm(Base):
    __tablename__ = "glossary"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    term = Column(Text, nullable=False, index=True)
    definition = Column(Text, nullable=False)
    domain = Column(Text, nullable=True, index=True)
    status = Column(Text, nullable=False, default="draft", index=True)
    tags = Column(JSON, nullable=True)
    related_terms = Column(JSON, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseBusinessReport(Base):
    __tablename__ = "business_reports"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(Text, nullable=False)
    report_type = Column(Text, nullable=False)
    dataset_name = Column(Text, nullable=True)
    status = Column(Text, nullable=False, default="Certified")
    quality_score = Column(Integer, nullable=True)
    last_refreshed_label = Column(Text, nullable=True)
    external_url = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseAlertSubscription(Base):
    __tablename__ = "alert_subscriptions"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)
    dataset_name = Column(Text, nullable=False)
    threshold = Column(Integer, nullable=False, default=85)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterprisePolicy(Base):
    __tablename__ = "policies"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    policy_name = Column(Text, nullable=False)
    domain = Column(Text, nullable=True, index=True)
    status = Column(Text, nullable=False, default="draft", index=True)
    content = Column(Text, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseAnalyticsMetric(Base):
    __tablename__ = "analytics_metrics"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    metric_key = Column(Text, nullable=False, index=True)
    metric_value = Column(JSON, nullable=False)
    domain = Column(Text, nullable=True, index=True)
    captured_at = Column(DateTime, default=func.now(), nullable=False, index=True)


class EnterpriseNotification(Base):
    __tablename__ = "notifications"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    channel = Column(Text, nullable=False, default="in_app")
    subject = Column(Text, nullable=False)
    body = Column(Text, nullable=True)
    severity = Column(Text, nullable=False, default="info")
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False, index=True)


class EnterpriseReportExport(Base):
    __tablename__ = "report_exports"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_type = Column(Text, nullable=False)
    format = Column(Text, nullable=False)
    payload = Column(JSON, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class GoldenMergeCandidate(Base):
    __tablename__ = "golden_merge_candidates"
    __table_args__ = {"schema": "metadata"}
    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id = Column(Integer, ForeignKey("enterprise.datasets.id"), nullable=False, index=True)
    row_group_key = Column(Text, nullable=False)  # join key value(s) that link these rows
    source_values = Column(JSON, nullable=False)  # {source_label: {col: value, ...}, ...}
    column_scores = Column(JSON, nullable=False)  # {col: {winner_source: str, score: float, values: {...}}}
    row_score = Column(Numeric, nullable=False)  # 0-100 overall confidence
    status = Column(Text, nullable=False, default="pending", index=True)  # pending/auto_merged/approved/rejected
    golden_values = Column(JSON, nullable=True)  # final merged {col: value}
    resolved_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    merge_config_snapshot = Column(JSON, nullable=True)  # config used when this candidate was scored


class GoldenMergeConfig(Base):
    __tablename__ = "golden_merge_configs"
    __table_args__ = {"schema": "metadata"}
    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id = Column(Integer, ForeignKey("enterprise.datasets.id"), nullable=False, unique=True)
    source_priority = Column(JSON, nullable=False, default=list)  # ordered list of source labels
    auto_merge_threshold = Column(Numeric, nullable=False, default=95.0)
    review_threshold = Column(Numeric, nullable=False, default=70.0)
    column_overrides = Column(JSON, nullable=False, default=dict)  # {col: "always_source_label" | "always_compute"}
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)