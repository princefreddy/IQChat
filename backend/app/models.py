from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
import datetime
from .db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    hashed_password = Column(String)
    avatar_url = Column(String, nullable=True)
    bio = Column(String, nullable=True, default="")
    is_banned = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Privacy & Security Preferences
    show_online_status = Column(Boolean, default=True)
    read_receipts_enabled = Column(Boolean, default=True)
    allow_dm_requests = Column(Boolean, default=True)

    # Slow Communication & Wellbeing Preferences
    quiet_hours_enabled = Column(Boolean, default=False)
    quiet_hours_start = Column(String, default="22:00")
    quiet_hours_end = Column(String, default="08:00")
    default_ephemeral_ttl = Column(Integer, default=10)
    auto_reset_mode = Column(Boolean, default=True)

    # Comfort & Display Preferences
    font_size = Column(String, default="normal")  # "compact", "normal", "large"
    enter_to_send = Column(Boolean, default=True)
    haptics_enabled = Column(Boolean, default=True)
    link_previews_enabled = Column(Boolean, default=True)


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String, primary_key=True, index=True)
    type = Column(String)  # "private" or "group"
    name = Column(String, nullable=True)  # Used for groups
    avatar_url = Column(String, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    members = relationship("ChatMember", back_populates="chat")
    messages = relationship("Message", back_populates="chat")


class ChatMember(Base):
    __tablename__ = "chat_members"

    id = Column(String, primary_key=True, index=True)
    chat_id = Column(String, ForeignKey("chats.id"))
    user_id = Column(String, ForeignKey("users.id"))
    role = Column(String, default="member")  # "admin" or "member"
    is_deleted = Column(Boolean, default=False)

    chat = relationship("Chat", back_populates="members")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, index=True)
    chat_id = Column(String, ForeignKey("chats.id"))
    sender_id = Column(String, ForeignKey("users.id"), nullable=True)
    content = Column(String)
    type = Column(String)  # "normal", "hidden", "ephemeral", "game_*"
    is_anonymous = Column(Boolean, default=False)
    ttl = Column(Integer, nullable=True)  # Used for "ephemeral", seconds
    reaction = Column(String, nullable=True)
    reactions_json = Column(String, nullable=True, default="{}")
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)
    visible_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)  # Computed when first read

    # File attachment fields
    file_url = Column(String, nullable=True)
    file_type = Column(String, nullable=True)  # "image", "video", "audio", "file"
    file_name = Column(String, nullable=True)  # Original filename

    # Reply feature
    reply_to_id = Column(String, ForeignKey("messages.id"), nullable=True)

    chat = relationship("Chat", back_populates="messages")


class Publication(Base):
    __tablename__ = "publications"

    id = Column(String, primary_key=True, index=True)
    author_id = Column(String, ForeignKey("users.id"))
    content = Column(String)
    repost_of_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    author = relationship("User", foreign_keys=[author_id])


class PublicationReaction(Base):
    __tablename__ = "publication_reactions"

    id = Column(String, primary_key=True, index=True)
    publication_id = Column(String, ForeignKey("publications.id"))
    user_id = Column(String, ForeignKey("users.id"))
    is_like = Column(Boolean)  # True = like, False = dislike
