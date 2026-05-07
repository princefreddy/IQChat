from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from ..db.database import get_db
from .. import models, schemas
from ..services.websockets import manager
from ..services.auth_utils import get_current_user
import uuid
import os
import aiofiles
from typing import Optional

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mp3", ".pdf", ".doc", ".docx"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    """Upload a file and return its URL. Used before sending a message with an attachment."""
    # Validate extension
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Type de fichier non autorisé. Extensions acceptées : {', '.join(ALLOWED_EXTENSIONS)}")
    
    # Validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 MB)")
    
    # Save file with unique name
    file_id = str(uuid.uuid4())
    filename = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)
    
    # Determine file type category
    image_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    video_exts = {".mp4"}
    audio_exts = {".mp3"}
    
    if ext in image_exts:
        file_type = "image"
    elif ext in video_exts:
        file_type = "video"
    elif ext in audio_exts:
        file_type = "audio"
    else:
        file_type = "file"
    
    return {
        "success": True,
        "url": f"/uploads/{filename}",
        "file_type": file_type,
        "original_name": file.filename,
    }


@router.post("/send", response_model=schemas.MessageOut)
async def send_message(message: schemas.MessageCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(models.Chat).filter(models.Chat.id == message.chat_id).first()
    if not chat or chat.status != 'accepted':
        raise HTTPException(status_code=403, detail="Chat invitation is pending or chat not found")

    if chat.type == 'private':
        db.query(models.ChatMember).filter(models.ChatMember.chat_id == message.chat_id).update({"is_deleted": False}, synchronize_session=False)

    new_msg = models.Message(
        id=str(uuid.uuid4()),
        chat_id=message.chat_id,
        sender_id=current_user.id,
        content=message.content,
        type=message.type,
        is_anonymous=message.is_anonymous,
        ttl=message.ttl,
        reaction=None,
        visible_at=message.visible_at,
        file_url=message.file_url,
        file_type=message.file_type,
        file_name=message.file_name,
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    sender_username = current_user.username if not message.is_anonymous else None
    sender_avatar = current_user.avatar_url if not message.is_anonymous else None

    msg_out = schemas.MessageOut(
        id=new_msg.id,
        chat_id=new_msg.chat_id,
        sender_id=current_user.id if not new_msg.is_anonymous else None,
        sender_username=sender_username,
        sender_avatar=sender_avatar,
        content=new_msg.content,
        type=new_msg.type,
        is_anonymous=new_msg.is_anonymous,
        ttl=new_msg.ttl,
        reaction=new_msg.reaction,
        is_read=new_msg.is_read,
        visible_at=new_msg.visible_at,
        created_at=new_msg.created_at,
        file_url=new_msg.file_url,
        file_type=new_msg.file_type,
        file_name=new_msg.file_name,
    )
    
    await manager.broadcast_to_chat(message.chat_id, msg_out.model_dump(mode='json'))
    return msg_out


@router.put("/{message_id}/reaction", response_model=schemas.MessageOut)
async def add_reaction(message_id: str, reaction: schemas.ReactionUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    msg.reaction = reaction.emoji
    db.commit()
    db.refresh(msg)
    
    sender_username = None
    sender_avatar = None
    if msg.sender_id and not msg.is_anonymous:
        user = db.query(models.User).filter(models.User.id == msg.sender_id).first()
        if user:
            sender_username = user.username
            sender_avatar = user.avatar_url
            
    msg_out = schemas.MessageOut(
        id=msg.id, chat_id=msg.chat_id, sender_id=msg.sender_id if not msg.is_anonymous else None,
        sender_username=sender_username, sender_avatar=sender_avatar,
        content=msg.content, type=msg.type, is_anonymous=msg.is_anonymous,
        ttl=msg.ttl, reaction=msg.reaction, is_read=msg.is_read,
        visible_at=msg.visible_at, created_at=msg.created_at,
        file_url=msg.file_url, file_type=msg.file_type, file_name=msg.file_name,
    )
    
    await manager.broadcast_to_chat(msg.chat_id, msg_out.model_dump(mode='json'))
    return msg_out


@router.get("/search")
def search_messages(chat_id: str, q: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Search messages in a chat by content."""
    if not q or len(q) < 2:
        return []
    
    results = db.query(models.Message).filter(
        models.Message.chat_id == chat_id,
        models.Message.content.ilike(f"%{q}%")
    ).order_by(models.Message.created_at.desc()).limit(20).all()
    
    user_ids = {msg.sender_id for msg in results if msg.sender_id}
    users_map = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all()}
    
    out = []
    for msg in results:
        sender = users_map.get(msg.sender_id) if msg.sender_id and not msg.is_anonymous else None
        out.append({
            "id": msg.id,
            "content": msg.content,
            "sender_username": sender.username if sender else ("Anonyme" if msg.is_anonymous else None),
            "created_at": msg.created_at.isoformat(),
        })
    return out
