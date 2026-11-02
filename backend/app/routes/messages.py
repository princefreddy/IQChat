from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from ..db.database import get_db
from .. import models, schemas
from ..services.websockets import manager
from ..services.auth_utils import get_current_user
from .chats import summarize_message_preview, parse_reactions_json, GAME_LABELS
import uuid
import os
import json
import datetime
import aiofiles

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif",
    ".mp4", ".mov", ".m4v",
    ".mp3", ".webm", ".m4a", ".wav", ".ogg", ".aac",
    ".pdf", ".doc", ".docx", ".txt", ".csv", ".zip",
}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


def _require_chat_membership(db: Session, chat_id: str, user_id: str) -> models.ChatMember:
    member = (
        db.query(models.ChatMember)
        .filter(models.ChatMember.chat_id == chat_id, models.ChatMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="Vous ne faites pas partie de cette discussion")
    return member


def _build_message_out(db: Session, msg: models.Message, viewer_id: str) -> schemas.MessageOut:
    now = datetime.datetime.utcnow()
    is_author = bool(msg.sender_id and msg.sender_id == viewer_id)
    is_locked = bool(msg.visible_at and msg.visible_at.replace(tzinfo=None) > now and not is_author)
    is_expired = bool(msg.type == "ephemeral" and msg.expires_at and msg.expires_at.replace(tzinfo=None) <= now)

    sender_username = None
    sender_avatar = None
    out_sender_id = msg.sender_id
    is_own_anonymous = False

    if msg.is_anonymous:
        if is_author:
            out_sender_id = msg.sender_id
            is_own_anonymous = True
        else:
            out_sender_id = None
    elif msg.sender_id:
        user = db.query(models.User).filter(models.User.id == msg.sender_id).first()
        if user:
            sender_username = user.username
            sender_avatar = user.avatar_url

    reply_to_content = None
    reply_to_sender = None
    if msg.reply_to_id:
        reply_msg = db.query(models.Message).filter(models.Message.id == msg.reply_to_id).first()
        if reply_msg:
            reply_to_content = summarize_message_preview(reply_msg, viewer_id, now)
            if reply_msg.sender_id and not reply_msg.is_anonymous:
                reply_user = db.query(models.User).filter(models.User.id == reply_msg.sender_id).first()
                if reply_user:
                    reply_to_sender = reply_user.username

    reactions_map = parse_reactions_json(msg.reactions_json, msg.reaction, msg.sender_id)

    content = "" if (is_locked or is_expired) else (msg.content or "")
    file_url = None if (is_locked or is_expired) else msg.file_url
    file_name = None if (is_locked or is_expired) else msg.file_name

    return schemas.MessageOut(
        id=msg.id,
        chat_id=msg.chat_id,
        sender_id=out_sender_id,
        sender_username=sender_username,
        sender_avatar=sender_avatar,
        content=content,
        type=msg.type,
        is_anonymous=msg.is_anonymous,
        is_own_anonymous=is_own_anonymous,
        ttl=msg.ttl,
        reaction=msg.reaction,
        reactions=reactions_map,
        is_read=msg.is_read,
        read_at=msg.read_at,
        visible_at=msg.visible_at,
        created_at=msg.created_at,
        expires_at=msg.expires_at,
        file_url=file_url,
        file_type=msg.file_type,
        file_name=file_name,
        reply_to_id=msg.reply_to_id,
        reply_to_content=reply_to_content,
        reply_to_sender=reply_to_sender,
    )


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Type de fichier non autorisé. Extensions acceptées : {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 25 MB)")

    file_id = str(uuid.uuid4())
    filename = f"{file_id}{ext}"

    from ..services.storage import is_s3_configured, upload_file_to_s3
    from fastapi.concurrency import run_in_threadpool
    import mimetypes

    if is_s3_configured():
        content_type, _ = mimetypes.guess_type(file.filename or "")
        if not content_type:
            content_type = "application/octet-stream"
        try:
            file_url = await run_in_threadpool(upload_file_to_s3, content, filename, content_type)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erreur stockage cloud : {str(e)}")
    else:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        filepath = os.path.join(UPLOAD_DIR, filename)
        async with aiofiles.open(filepath, "wb") as f:
            await f.write(content)
        file_url = f"/uploads/{filename}"

    image_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"}
    video_exts = {".mp4", ".mov", ".m4v"}
    audio_exts = {".mp3", ".webm", ".m4a", ".wav", ".ogg", ".aac"}

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
        "url": file_url,
        "file_type": file_type,
        "original_name": file.filename,
    }


@router.post("/send", response_model=schemas.MessageOut)
async def send_message(
    message: schemas.MessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(models.Chat).filter(models.Chat.id == message.chat_id).first()
    if not chat or chat.status != "accepted":
        raise HTTPException(status_code=403, detail="L'invitation est en attente ou la discussion est introuvable")

    _require_chat_membership(db, message.chat_id, current_user.id)

    members = db.query(models.ChatMember).filter(models.ChatMember.chat_id == message.chat_id).all()
    if chat.type == "private":
        for m in members:
            m.is_deleted = False

    norm_visible_at = None
    if message.visible_at:
        if message.visible_at.tzinfo is not None:
            norm_visible_at = message.visible_at.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        else:
            norm_visible_at = message.visible_at

    # Note: ephemeral expires_at is intentionally None until the first recipient reads the message!
    new_msg = models.Message(
        id=str(uuid.uuid4()),
        chat_id=message.chat_id,
        sender_id=current_user.id,
        content=message.content,
        type=message.type,
        is_anonymous=message.is_anonymous,
        ttl=message.ttl if message.type == "ephemeral" else None,
        expires_at=None,
        read_at=None,
        reaction=None,
        reactions_json="{}",
        visible_at=norm_visible_at,
        file_url=message.file_url,
        file_type=message.file_type,
        file_name=message.file_name,
        reply_to_id=message.reply_to_id,
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    author_out = _build_message_out(db, new_msg, current_user.id)
    await manager.broadcast_message_to_chat(
        message.chat_id,
        author_out.model_dump(mode="json"),
        real_sender_id=current_user.id,
        visible_at_dt=norm_visible_at,
    )
    await manager.notify_users(
        [m.user_id for m in members],
        {"event": "chats_updated", "chat_id": message.chat_id},
    )
    return author_out


@router.patch("/{message_id}/content", response_model=schemas.MessageOut)
async def update_message_content(
    message_id: str,
    update_data: schemas.MessageUpdateContent,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")

    _require_chat_membership(db, msg.chat_id, current_user.id)

    # Regular text messages can only be edited by their author; mini-games can be updated by participants
    if not (msg.type or "").startswith("game_") and msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que vos propres messages")

    msg.content = update_data.content
    db.commit()
    db.refresh(msg)

    out = _build_message_out(db, msg, current_user.id)
    await manager.broadcast_message_to_chat(
        msg.chat_id,
        out.model_dump(mode="json"),
        real_sender_id=msg.sender_id,
        visible_at_dt=msg.visible_at,
    )
    return out


@router.delete("/{message_id}")
async def delete_message(
    message_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")

    member = _require_chat_membership(db, msg.chat_id, current_user.id)
    if msg.sender_id != current_user.id and member.role != "admin" and current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que vos propres messages")

    chat_id = msg.chat_id
    db.delete(msg)
    db.commit()

    await manager.broadcast_to_chat(chat_id, {"event": "message_deleted", "message_id": message_id})
    members = db.query(models.ChatMember).filter(models.ChatMember.chat_id == chat_id).all()
    await manager.notify_users([m.user_id for m in members], {"event": "chats_updated", "chat_id": chat_id})
    return {"success": True, "deleted_id": message_id}


@router.put("/{message_id}/reaction", response_model=schemas.MessageOut)
async def add_reaction(
    message_id: str,
    reaction: schemas.ReactionUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")

    _require_chat_membership(db, msg.chat_id, current_user.id)

    reactions_map = parse_reactions_json(msg.reactions_json, msg.reaction, msg.sender_id)
    uid = current_user.id
    emoji = (reaction.emoji or "").strip()

    # Check if user already reacted with this exact emoji (toggle off)
    already_has_same = emoji and uid in reactions_map.get(emoji, [])

    # Remove user's previous reaction from any emoji bucket so 1 reaction per user per message
    for k in list(reactions_map.keys()):
        if uid in reactions_map[k]:
            reactions_map[k] = [u for u in reactions_map[k] if u != uid]
        if not reactions_map[k]:
            del reactions_map[k]

    if emoji and not already_has_same:
        reactions_map.setdefault(emoji, []).append(uid)

    msg.reactions_json = json.dumps(reactions_map)
    # Keep legacy single `reaction` column synced with the first active emoji (or None)
    msg.reaction = next(iter(reactions_map.keys()), None)
    db.commit()
    db.refresh(msg)

    out = _build_message_out(db, msg, current_user.id)
    await manager.broadcast_message_to_chat(
        msg.chat_id,
        out.model_dump(mode="json"),
        real_sender_id=msg.sender_id,
        visible_at_dt=msg.visible_at,
    )
    return out


@router.get("/search")
def search_messages(
    chat_id: str,
    q: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search messages in a chat while respecting delayed, expired, hidden, and game states."""
    _require_chat_membership(db, chat_id, current_user.id)

    if not q or len(q.strip()) < 2:
        return []

    now = datetime.datetime.utcnow()
    results = (
        db.query(models.Message)
        .filter(
            models.Message.chat_id == chat_id,
            models.Message.content.ilike(f"%{q.strip()}%"),
        )
        .order_by(models.Message.created_at.desc())
        .limit(30)
        .all()
    )

    user_ids = {msg.sender_id for msg in results if msg.sender_id}
    users_map = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all()} if user_ids else {}

    out = []
    for msg in results:
        if msg.type in GAME_LABELS:
            continue
        if msg.visible_at and msg.visible_at.replace(tzinfo=None) > now and msg.sender_id != current_user.id:
            continue
        if msg.type == "ephemeral" and msg.expires_at and msg.expires_at.replace(tzinfo=None) <= now:
            continue
        if msg.type == "hidden" and msg.sender_id != current_user.id:
            continue

        sender = users_map.get(msg.sender_id) if msg.sender_id and not msg.is_anonymous else None
        out.append(
            {
                "id": msg.id,
                "content": msg.content,
                "sender_username": sender.username if sender else ("Anonyme" if msg.is_anonymous else None),
                "created_at": msg.created_at.isoformat(),
            }
        )
    return out[:20]
