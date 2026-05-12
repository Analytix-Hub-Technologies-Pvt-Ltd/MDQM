from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, ForeignKeyConstraint
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

    table = relationship("TableMetadata", back_populates="columns")

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
    __table_args__ = {'schema': 'metadata'}

    connection_id = Column(Integer, primary_key=True, index=True)
    connection_name = Column(String, unique=True, nullable=False)
    host = Column(String, nullable=False)
    port = Column(String, default="5432")
    username = Column(String, nullable=False)
    password = Column(String, nullable=True)
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