from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.database import get_db
from .. import models, schemas
from ..services.auth_utils import get_current_user
import uuid
from typing import List
from ..services.websockets import manager

router = APIRouter()

@router.post("/create", response_model=schemas.ChatOutBase)
def create_chat(chat: schemas.ChatCreate, db: Session = Depends(get_db)):
    users = db.query(models.User).filter(models.User.username.in_(chat.member_usernames)).all()
    if len(users) != len(set(chat.member_usernames)):
        raise HTTPException(status_code=400, detail="One or more users not found")

    # Anti-duplication logic for Private Chats
    if chat.type == 'private' and len(users) == 2:
        chat_ids_1 = {m.chat_id for m in db.query(models.ChatMember).filter(models.ChatMember.user_id == users[0].id).all()}
        chat_ids_2 = {m.chat_id for m in db.query(models.ChatMember).filter(models.ChatMember.user_id == users[1].id).all()}
        common_ids = chat_ids_1.intersection(chat_ids_2)
        if common_ids:
            existing_chat = db.query(models.Chat).filter(models.Chat.id.in_(list(common_ids)), models.Chat.type == 'private').first()
            if existing_chat:
                return existing_chat

    initial_status = "accepted" if chat.type == "group" or "admin" in chat.member_usernames else "pending"
    new_chat = models.Chat(
        id=str(uuid.uuid4()),
        type=chat.type,
        name=chat.name,
        avatar_url=None,
        status=initial_status
    )
    db.add(new_chat)
    db.commit()

    ordered_users = []
    for uname in chat.member_usernames:
        u = next((usr for usr in users if usr.username == uname), None)
        if u: ordered_users.append(u)

    for i, user in enumerate(ordered_users):
        member = models.ChatMember(
            id=str(uuid.uuid4()),
            chat_id=new_chat.id,
            user_id=user.id,
            role="admin" if i == 0 else "member"
        )
        db.add(member)
    
    db.commit()
    db.refresh(new_chat)
    return new_chat

@router.post("/{id}/add_members")
def add_chat_members(id: str, payload: schemas.AddMembers, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat or chat.type != 'group':
        raise HTTPException(status_code=400, detail="Invalid group")
    
    caller_member = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == current_user.id).first()
    if not caller_member or caller_member.role != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can add members")
        
    users = db.query(models.User).filter(models.User.username.in_(payload.member_usernames)).all()
    existing_user_ids = {m.user_id for m in db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).all()}
    
    added_count = 0
    for user in users:
        if user.id not in existing_user_ids:
            member = models.ChatMember(
                id=str(uuid.uuid4()),
                chat_id=chat.id,
                user_id=user.id,
                role="member"
            )
            db.add(member)
            added_count += 1
            
    if added_count > 0:
        db.commit()
    return {"success": True, "added_count": added_count}

@router.get("/", response_model=List[schemas.ChatListItemOut])
def get_chats(user_id: str, db: Session = Depends(get_db)):
    """Optimized chat list — reduced N+1 queries by batch-loading users."""
    memberships = db.query(models.ChatMember).filter(
        models.ChatMember.user_id == user_id, 
        models.ChatMember.is_deleted == False
    ).all()
    chat_ids = [m.chat_id for m in memberships]
    
    if not chat_ids:
        return []
    
    chats = db.query(models.Chat).filter(models.Chat.id.in_(chat_ids)).all()
    
    # Batch load all members for all chats at once
    all_members = db.query(models.ChatMember).filter(models.ChatMember.chat_id.in_(chat_ids)).all()
    all_member_user_ids = {m.user_id for m in all_members}
    all_users = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(all_member_user_ids)).all()}
    
    # Group members by chat_id
    members_by_chat = {}
    for m in all_members:
        members_by_chat.setdefault(m.chat_id, []).append(m)
    
    # Batch load unread counts and last messages
    from sqlalchemy import func
    
    unread_counts = dict(
        db.query(models.Message.chat_id, func.count(models.Message.id))
        .filter(
            models.Message.chat_id.in_(chat_ids),
            models.Message.sender_id != user_id,
            models.Message.is_read == False
        )
        .group_by(models.Message.chat_id)
        .all()
    )
    
    last_messages = dict(
        db.query(models.Message.chat_id, func.max(models.Message.created_at))
        .filter(models.Message.chat_id.in_(chat_ids))
        .group_by(models.Message.chat_id)
        .all()
    )
    
    chat_list = []
    for chat in chats:
        members = members_by_chat.get(chat.id, [])
        member_outs = []
        for m in members:
            user_obj = all_users.get(m.user_id)
            if user_obj:
                member_outs.append(schemas.ChatMemberOut(
                    user_id=user_obj.id, 
                    username=user_obj.username,
                    full_name=user_obj.full_name,
                    avatar_url=user_obj.avatar_url,
                    role=m.role,
                    is_online=manager.is_user_online(user_obj.id),
                    is_banned=user_obj.is_banned
                ))
                
        unread = unread_counts.get(chat.id, 0)
        last_at = last_messages.get(chat.id, chat.created_at)
        
        chat_list.append(schemas.ChatListItemOut(
            id=chat.id,
            type=chat.type,
            name=chat.name,
            avatar_url=chat.avatar_url,
            status=chat.status,
            created_at=chat.created_at,
            members=member_outs,
            last_message_at=last_at,
            unread_count=unread
        ))

    chat_list.sort(key=lambda x: x.last_message_at, reverse=True)
    return chat_list

@router.get("/{id}", response_model=schemas.ChatOutDetail)
def get_chat(id: str, user_id: str, db: Session = Depends(get_db)):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    db.query(models.Message).filter(
        models.Message.chat_id == id,
        models.Message.sender_id != user_id,
        models.Message.is_read == False
    ).update({"is_read": True})
    db.commit()
    
    members = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).all()
    messages = db.query(models.Message).filter(models.Message.chat_id == id).order_by(models.Message.created_at.asc()).all()
    
    # Batch load reply messages
    reply_ids = {msg.reply_to_id for msg in messages if msg.reply_to_id}
    reply_msgs = {m.id: m for m in db.query(models.Message).filter(models.Message.id.in_(reply_ids)).all()} if reply_ids else {}
    
    # Batch load all users for members, message senders, and reply senders
    all_user_ids = {m.user_id for m in members}
    all_user_ids.update({msg.sender_id for msg in messages if msg.sender_id})
    all_user_ids.update({rm.sender_id for rm in reply_msgs.values() if rm.sender_id})
    all_users = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(all_user_ids)).all()}
    
    member_outs = []
    for m in members:
        user = all_users.get(m.user_id)
        if user:
            member_outs.append({
                "user_id": user.id, 
                "username": user.username,
                "full_name": user.full_name,
                "avatar_url": user.avatar_url,
                "role": m.role,
                "is_online": manager.is_user_online(user.id),
                "is_banned": user.is_banned
            })

    msg_outs = []
    for msg in messages:
        sender_username, sender_avatar = None, None
        if msg.sender_id and not msg.is_anonymous:
            user = all_users.get(msg.sender_id)
            if user:
                sender_username = user.username
                sender_avatar = user.avatar_url
                
        reply_to_content = None
        reply_to_sender = None
        if msg.reply_to_id and msg.reply_to_id in reply_msgs:
            rm = reply_msgs[msg.reply_to_id]
            reply_to_content = rm.content
            if rm.file_type == 'audio':
                reply_to_content = '🎤 Message vocal'
            elif rm.file_type:
                reply_to_content = '📎 Pièce jointe'
            if rm.sender_id and not rm.is_anonymous:
                ru = all_users.get(rm.sender_id)
                if ru:
                    reply_to_sender = ru.username
        
        msg_outs.append(schemas.MessageOut(
            id=msg.id,
            chat_id=msg.chat_id,
            sender_id=msg.sender_id if not msg.is_anonymous else None,
            sender_username=sender_username,
            sender_avatar=sender_avatar,
            content=msg.content,
            type=msg.type,
            is_anonymous=msg.is_anonymous,
            ttl=msg.ttl,
            reaction=msg.reaction,
            is_read=msg.is_read,
            created_at=msg.created_at,
            expires_at=msg.expires_at,
            file_url=msg.file_url,
            file_type=msg.file_type,
            file_name=msg.file_name,
            reply_to_id=msg.reply_to_id,
            reply_to_content=reply_to_content,
            reply_to_sender=reply_to_sender,
        ))

    return {
        "id": chat.id,
        "type": chat.type,
        "name": chat.name,
        "avatar_url": chat.avatar_url,
        "status": chat.status,
        "created_at": chat.created_at,
        "members": member_outs,
        "messages": msg_outs
    }

@router.patch("/{id}/accept", response_model=schemas.ChatOutBase)
def accept_chat(id: str, user_id: str, db: Session = Depends(get_db)):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    member = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member")
        
    chat.status = "accepted"
    db.commit()
    db.refresh(chat)
    return chat

@router.delete("/{id}")
def delete_chat(id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat or chat.type != 'group':
        raise HTTPException(status_code=400, detail="Invalid group or not found")
        
    caller = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == current_user.id).first()
    if not caller or caller.role != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can delete groups globally")
        
    db.query(models.Message).filter(models.Message.chat_id == id).delete(synchronize_session=False)
    db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).delete(synchronize_session=False)
    db.delete(chat)
    db.commit()
    return {"success": True}

@router.delete("/{id}/leave")
def leave_or_hide_chat(id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
        
    member = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == current_user.id).first()
    if not member:
        raise HTTPException(status_code=400, detail="Not a member")
        
    if chat.type == 'group':
        db.delete(member)
    else:
        member.is_deleted = True
    db.commit()
    return {"success": True}

@router.delete("/{id}/members/{target_user_id}")
def kick_chat_member(id: str, target_user_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat or chat.type != 'group':
        raise HTTPException(status_code=400, detail="Invalid group or not found")
        
    caller = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == current_user.id).first()
    if not caller or caller.role != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can kick members")
        
    if target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot kick yourself, use /leave instead")
        
    target_member = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == target_user_id).first()
    if not target_member:
        raise HTTPException(status_code=404, detail="Target member not found")
        
    db.delete(target_member)
    db.commit()
    return {"success": True}
