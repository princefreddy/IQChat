from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

import os
import logging

logger = logging.getLogger(__name__)

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./iqchat.db")

# SQLAlchemy 1.4+ compatibility: postgres:// is deprecated, replace with postgresql://
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def run_auto_migrations():
    """
    Safely adds new columns to existing SQLite / PostgreSQL tables using a single connection,
    and upgrades legacy DiceBear .svg avatar URLs to .png so mobile native Image renders them.
    """
    is_sqlite = engine.dialect.name == "sqlite"
    bool_true = "1" if is_sqlite else "TRUE"
    bool_false = "0" if is_sqlite else "FALSE"
    dt_type = "DATETIME" if is_sqlite else "TIMESTAMP"

    user_migrations = [
        ("bio", "VARCHAR DEFAULT ''"),
        ("show_online_status", f"BOOLEAN DEFAULT {bool_true}"),
        ("read_receipts_enabled", f"BOOLEAN DEFAULT {bool_true}"),
        ("allow_dm_requests", f"BOOLEAN DEFAULT {bool_true}"),
        ("quiet_hours_enabled", f"BOOLEAN DEFAULT {bool_false}"),
        ("quiet_hours_start", "VARCHAR DEFAULT '22:00'"),
        ("quiet_hours_end", "VARCHAR DEFAULT '08:00'"),
        ("default_ephemeral_ttl", "INTEGER DEFAULT 10"),
        ("auto_reset_mode", f"BOOLEAN DEFAULT {bool_true}"),
        ("font_size", "VARCHAR DEFAULT 'normal'"),
        ("enter_to_send", f"BOOLEAN DEFAULT {bool_true}"),
        ("haptics_enabled", f"BOOLEAN DEFAULT {bool_true}"),
        ("link_previews_enabled", f"BOOLEAN DEFAULT {bool_true}"),
    ]

    message_migrations = [
        ("reactions_json", "VARCHAR DEFAULT '{}'"),
        ("read_at", f"{dt_type} NULL"),
    ]

    with engine.begin() as conn:
        inspector = inspect(conn)
        tables = set(inspector.get_table_names())

        if "users" in tables:
            existing_user_cols = {c["name"] for c in inspector.get_columns("users")}
            for col_name, col_ddl in user_migrations:
                if col_name not in existing_user_cols:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_ddl}"))

            conn.execute(
                text(
                    "UPDATE users SET avatar_url = REPLACE(avatar_url, '/svg?seed=', '/png?seed=') "
                    "WHERE avatar_url LIKE '%api.dicebear.com%/svg?seed=%'"
                )
            )

        if "messages" in tables:
            existing_msg_cols = {c["name"] for c in inspector.get_columns("messages")}
            for col_name, col_ddl in message_migrations:
                if col_name not in existing_msg_cols:
                    conn.execute(text(f"ALTER TABLE messages ADD COLUMN {col_name} {col_ddl}"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
