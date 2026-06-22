from sqlalchemy import BigInteger, Column, Integer, String, Boolean, ForeignKey, DateTime, Text, ForeignKeyConstraint, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = {'schema': 'metadata'}

    job_id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String)
    status = Column(String, default="Pending")
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    created_at = Column(DateTime, default=func.now())
    """Stored when job is created from Postgres (see /db/connect); used by refresh-from-db."""
    db_source_config = Column(JSON, nullable=True)

    tables = relationship("TableMetadata", back_populates="job")
    # FIX: Added overlaps to silence warning
    rules = relationship("Rule", back_populates="job", overlaps="table,rules")

class TableMetadata(Base):
    __tablename__ = "table_metadata"
    __table_args__ = {'schema': 'metadata'}

    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), primary_key=True)
    table_id = Column(Integer, primary_key=True) 
    
    table_name = Column(String)
    row_count = Column(Integer, default=0)
    data_updated_at = Column(DateTime(timezone=True), nullable=True)

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
    column_name = Column(String)
    data_type = Column(String)
    description = Column(Text, nullable=True)
    description_generated_at = Column(DateTime(timezone=True), nullable=True)

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


class Rule(Base):
    __tablename__ = "rules"
    __table_args__ = (
        ForeignKeyConstraint(['job_id', 'table_id'], ['metadata.table_metadata.job_id', 'metadata.table_metadata.table_id']),
        {'schema': 'metadata'}
    )

    rule_id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"))
    table_id = Column(Integer)
    
    column_name = Column(String)
    data_type = Column(String)
    rule_type = Column(String)
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
    
    table_name = Column(String)
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
    table_name = Column(String)
    row_id = Column(Integer)
    column_name = Column(String)
    error_type = Column(String) 
    error_value = Column(Text)
    description = Column(Text)
    fuzzy_score = Column(Integer, default=0)
    master_match = Column(String, nullable=True)
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
    
    table_name = Column(String) 
    master_value = Column(String)


class DbConnection(Base):
    __tablename__ = "db_connections"
    __table_args__ = (
        UniqueConstraint("connection_name", "user_id", name="uq_db_connections_name_user"),
        {'schema': 'metadata'},
    )

    connection_id = Column(Integer, primary_key=True, index=True)
    connection_name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(String, default="5432")
    username = Column(String, nullable=False)
    password = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    db_type = Column(String(32), nullable=True, default="postgres")
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
    full_name = Column(String(255), nullable=False)
    username = Column(String(64), unique=True, nullable=True, index=True)
    email = Column(String(320), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="user")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=func.now())
    created_by = Column(Integer, ForeignKey("auth.users.id"), nullable=True)

    # Invitation/password-setup architecture (email delivery not implemented yet)
    invite_token_hash = Column(String(128), nullable=True)
    invite_expires_at = Column(DateTime, nullable=True)
    password_configured = Column(Boolean, nullable=False, default=True)


class AccessRequest(Base):
    __tablename__ = "access_requests"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    full_name = Column(String(255), nullable=False)
    username = Column(String(64), nullable=True, index=True)
    email = Column(String(320), nullable=False, index=True)
    department = Column(String(255), nullable=True)
    reason = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="pending")
    requested_at = Column(DateTime, default=func.now())
    # Extended data-access workflow (governance-style requests from logged-in users)
    dataset_name = Column(String(255), nullable=True)
    access_type = Column(String(32), nullable=True)
    duration = Column(String(64), nullable=True)
    approver_name = Column(String(255), nullable=True)


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(64), unique=True, nullable=False)
    description = Column(Text, nullable=True)


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(128), unique=True, nullable=False)
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
    action = Column(String(255), nullable=False)
    entity_type = Column(String(128), nullable=True)
    entity_id = Column(String(128), nullable=True)
    ip_address = Column(String(64), nullable=True)
    old_values = Column(Text, nullable=True)
    new_values = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class GovernancePolicy(Base):
    __tablename__ = "governance_policies"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    policy_name = Column(String(255), nullable=False)
    domain = Column(String(128), nullable=True, index=True)
    status = Column(String(64), nullable=False, default="draft")
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class StewardshipTask(Base):
    __tablename__ = "stewardship_tasks"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    dataset_name = Column(String(255), nullable=False)
    assigned_to_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    status = Column(String(64), nullable=False, default="open")
    severity = Column(String(32), nullable=False, default="medium")
    created_at = Column(DateTime, default=func.now(), nullable=False)


class LineageNode(Base):
    __tablename__ = "lineage_nodes"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    node_key = Column(String(255), nullable=False, unique=True)
    node_type = Column(String(64), nullable=False)
    domain = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class LineageEdge(Base):
    __tablename__ = "lineage_edges"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    from_node_id = Column(Integer, ForeignKey("governance.lineage_nodes.id"), nullable=False)
    to_node_id = Column(Integer, ForeignKey("governance.lineage_nodes.id"), nullable=False)
    relation_type = Column(String(64), nullable=False, default="depends_on")
    created_at = Column(DateTime, default=func.now(), nullable=False)


class DatasetAccess(Base):
    __tablename__ = "dataset_access"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    dataset_name = Column(String(255), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)
    access_level = Column(String(32), nullable=False, default="read")
    pii_allowed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class WorkflowApproval(Base):
    __tablename__ = "workflow_approvals"
    __table_args__ = {"schema": "governance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    request_type = Column(String(128), nullable=False)
    request_ref = Column(String(128), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    status = Column(String(32), nullable=False, default="pending")
    created_at = Column(DateTime, default=func.now(), nullable=False)


# --- Enterprise dashboard persistence (schema: enterprise) ---


class EnterpriseSchedule(Base):
    __tablename__ = "schedules"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    schedule_type = Column(String(32), nullable=False, default="interval")
    cron_expression = Column(String(128), nullable=True)
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
    status = Column(String(32), nullable=False, default="queued", index=True)
    message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseApiLog(Base):
    __tablename__ = "api_logs"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    method = Column(String(16), nullable=False)
    path = Column(String(512), nullable=False, index=True)
    status_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    correlation_id = Column(String(64), nullable=True, index=True)
    ip_address = Column(String(64), nullable=True)
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
    table_name = Column(String(255), nullable=False)
    open_issues = Column(Integer, nullable=False, default=0)
    last_error_type = Column(String(128), nullable=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class EnterpriseAccessLog(Base):
    __tablename__ = "access_logs"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    resource = Column(String(255), nullable=False, index=True)
    action = Column(String(128), nullable=False)
    ip_address = Column(String(64), nullable=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False, index=True)


class EnterpriseComplianceReport(Base):
    __tablename__ = "compliance_reports"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    framework = Column(String(64), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="draft", index=True)
    body = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseDataset(Base):
    __tablename__ = "datasets"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True)
    domain = Column(String(128), nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    job_id = Column(Integer, ForeignKey("metadata.jobs.job_id"), nullable=True, index=True)
    classification = Column(String(64), nullable=True)
    description = Column(Text, nullable=True)
    tier = Column(String(32), nullable=True)
    quality_score = Column(Integer, nullable=True)
    record_count_label = Column(String(64), nullable=True)
    pii = Column(Boolean, nullable=False, default=False)
    steward_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseGlossaryTerm(Base):
    __tablename__ = "glossary"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    term = Column(String(255), nullable=False, index=True)
    definition = Column(Text, nullable=False)
    domain = Column(String(128), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="draft", index=True)
    tags = Column(JSON, nullable=True)
    related_terms = Column(JSON, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseBusinessReport(Base):
    __tablename__ = "business_reports"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    report_type = Column(String(64), nullable=False)
    dataset_name = Column(String(255), nullable=True)
    status = Column(String(32), nullable=False, default="Certified")
    quality_score = Column(Integer, nullable=True)
    last_refreshed_label = Column(String(64), nullable=True)
    external_url = Column(String(512), nullable=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseAlertSubscription(Base):
    __tablename__ = "alert_subscriptions"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)
    dataset_name = Column(String(255), nullable=False)
    threshold = Column(Integer, nullable=False, default=85)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterprisePolicy(Base):
    __tablename__ = "policies"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    policy_name = Column(String(255), nullable=False)
    domain = Column(String(128), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="draft", index=True)
    content = Column(Text, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class EnterpriseAnalyticsMetric(Base):
    __tablename__ = "analytics_metrics"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    metric_key = Column(String(128), nullable=False, index=True)
    metric_value = Column(JSON, nullable=False)
    domain = Column(String(128), nullable=True, index=True)
    captured_at = Column(DateTime, default=func.now(), nullable=False, index=True)


class EnterpriseNotification(Base):
    __tablename__ = "notifications"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)
    channel = Column(String(32), nullable=False, default="in_app")
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    severity = Column(String(32), nullable=False, default="info")
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False, index=True)


class EnterpriseReportExport(Base):
    __tablename__ = "report_exports"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_type = Column(String(64), nullable=False)
    format = Column(String(16), nullable=False)
    payload = Column(JSON, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

class EnterpriseTicket(Base):
    __tablename__ = "tickets"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=True, default="Bug Issue")
    priority = Column(String(20), nullable=False, default="Medium")
    status = Column(String(50), nullable=False, default="Open", index=True)

    created_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)
    created_by_role = Column(String(50), nullable=True)
    assigned_to_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)

    fix_note = Column(Text, nullable=True)
    fixed_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    verified_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)
    closed_by_user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True)

    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    fixed_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    


class EnterpriseTicketComment(Base):
    __tablename__ = "ticket_comments"
    __table_args__ = {"schema": "enterprise"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("enterprise.tickets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
