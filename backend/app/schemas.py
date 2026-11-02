from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


# --- User Schemas ---
class UserBase(BaseModel):
    username: str
    email: str
    full_name: str


class UserCreate(UserBase):
    password: str
    avatar_url: Optional[str] = None


class UserLogin(BaseModel):
    identifier: str  # username or email
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    current_password: Optional[str] = None
    password: Optional[str] = None

    # Privacy & Security
    show_online_status: Optional[bool] = None
    read_receipts_enabled: Optional[bool] = None
    allow_dm_requests: Optional[bool] = None

    # Slow Communication & Wellbeing
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    default_ephemeral_ttl: Optional[int] = None
    auto_reset_mode: Optional[bool] = None

    # Comfort & Display
    font_size: Optional[str] = None
    enter_to_send: Optional[bool] = None
    haptics_enabled: Optional[bool] = None
    link_previews_enabled: Optional[bool] = None


class UserOut(UserBase):
    id: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = ""
    created_at: datetime
    is_online: Optional[bool] = False
    is_banned: bool = False
    is_in_quiet_hours: bool = False

    # Settings & Preferences
    show_online_status: bool = True
    read_receipts_enabled: bool = True
    allow_dm_requests: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "08:00"
    default_ephemeral_ttl: int = 10
    auto_reset_mode: bool = True
    font_size: str = "normal"
    enter_to_send: bool = True
    haptics_enabled: bool = True
    link_previews_enabled: bool = True

    class Config:
        from_attributes = True


# --- Message Schemas ---
class MessageCreate(BaseModel):
    chat_id: str
    content: str
    type: str = "normal"
    ttl: Optional[int] = None
    is_anonymous: bool = False
    visible_at: Optional[datetime] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    file_name: Optional[str] = None
    reply_to_id: Optional[str] = None


class ReactionUpdate(BaseModel):
    emoji: Optional[str] = None


class MessageUpdateContent(BaseModel):
    content: str


class MessageOut(BaseModel):
    id: str
    chat_id: str
    sender_id: Optional[str] = None
    sender_username: Optional[str] = None
    sender_avatar: Optional[str] = None
    content: str
    type: str
    is_anonymous: bool
    is_own_anonymous: bool = False
    ttl: Optional[int] = None
    reaction: Optional[str] = None
    reactions: Optional[Dict[str, List[str]]] = None
    is_read: bool = False
    read_at: Optional[datetime] = None
    visible_at: Optional[datetime] = None
    created_at: datetime
    expires_at: Optional[datetime] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    file_name: Optional[str] = None
    reply_to_id: Optional[str] = None
    reply_to_content: Optional[str] = None
    reply_to_sender: Optional[str] = None

    class Config:
        from_attributes = True


# --- Chat Schemas ---
class ChatCreate(BaseModel):
    type: str
    name: Optional[str] = None
    member_usernames: List[str]
    initial_message: Optional[str] = None


class AddMembers(BaseModel):
    member_usernames: List[str]


class ChatOutBase(BaseModel):
    id: str
    type: str
    name: Optional[str]
    avatar_url: Optional[str]
    status: str = "pending"
    created_at: datetime

    class Config:
        from_attributes = True


class ChatMemberOut(BaseModel):
    user_id: str
    username: str
    full_name: str | None
    avatar_url: str | None
    bio: str | None = ""
    role: str
    is_online: Optional[bool] = False
    is_banned: bool = False
    is_in_quiet_hours: bool = False
    quiet_hours_end: str | None = None


class ChatOutDetail(ChatOutBase):
    members: List[ChatMemberOut] = []
    messages: List[MessageOut] = []


class ChatListItemOut(ChatOutBase):
    members: List[ChatMemberOut] = []
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None
    last_message_type: Optional[str] = None
    unread_count: int = 0


class AnnouncementCreate(BaseModel):
    content: str
