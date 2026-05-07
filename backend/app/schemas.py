from pydantic import BaseModel
from typing import Optional, List
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
    identifier: str # username or email
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    password: Optional[str] = None

class UserOut(UserBase):
    id: str
    avatar_url: Optional[str]
    created_at: datetime
    is_online: Optional[bool] = False
    
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

class ReactionUpdate(BaseModel):
    emoji: str

class MessageOut(BaseModel):
    id: str
    chat_id: str
    sender_id: Optional[str] = None 
    sender_username: Optional[str] = None
    sender_avatar: Optional[str] = None
    content: str
    type: str
    is_anonymous: bool
    ttl: Optional[int]
    reaction: Optional[str] = None
    is_read: bool = False
    visible_at: Optional[datetime] = None
    created_at: datetime
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    file_name: Optional[str] = None

    class Config:
        from_attributes = True

# --- Chat Schemas ---
class ChatCreate(BaseModel):
    type: str 
    name: Optional[str] = None
    member_usernames: List[str]

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
    role: str
    is_online: Optional[bool] = False
    is_banned: bool = False

class ChatOutDetail(ChatOutBase):
    members: List[ChatMemberOut] = []
    messages: List[MessageOut] = []

class ChatListItemOut(ChatOutBase):
    members: List[ChatMemberOut] = []
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
