from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..db.database import get_db
from .. import models, schemas
from ..services.auth_utils import get_current_user, is_user_in_quiet_hours
from ..services.websockets import manager
import uuid
import json
import datetime
from typing import List, Optional

router = APIRouter()

GAME_LABELS = {
    "game_tictactoe": "Partie de Morpion",
    "game_connect4": "Partie de Puissance 4",
    "game_rps": "Pierre-Papier-Ciseaux",
    "game_word_mystery": "Le Mot Mystère",
}


def parse_reactions_json(raw: Optional[str], legacy_emoji: Optional[str], sender_id: Optional[str]) -> dict:
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and parsed:
                return {k: v for k, v in parsed.items() if isinstance(v, list) and len(v) > 0}
        except Exception:
            pass
    if legacy_emoji:
        return {legacy_emoji: [sender_id or "legacy"]}
    return {}


def summarize_message_preview(msg: models.Message, viewer_id: str, now: datetime.datetime) -> str:
    if msg.visible_at and msg.visible_at.replace(tzinfo=None) > now and msg.sender_id != viewer_id:
        return "Message différé"
    if msg.type == "ephemeral" and msg.expires_at and msg.expires_at.replace(tzinfo=None) <= now:
        return "Message éphémère expiré"
    if msg.type == "hidden" and msg.sender_id != viewer_id:
        return "Message caché"
    if msg.type == "ephemeral" and msg.sender_id != viewer_id and not msg.read_at:
        return "Message éphémère"
    if msg.type in GAME_LABELS:
        return GAME_LABELS[msg.type]
    if msg.file_type == "audio":
        return "Message vocal"
    if msg.file_type == "image":
        return "Photo"
    if msg.file_type == "video":
        return "Vidéo"
    if msg.file_type:
        return msg.file_name or "Document"
    text = (msg.content or "").strip()
    if len(text) > 65:
        return text[:62] + "..."
    return text or "Nouveau message"


def build_member_out(user_obj: models.User, role: str) -> schemas.ChatMemberOut:
    raw_online = manager.is_user_online(user_obj.id)
    visible_online = raw_online if getattr(user_obj, "show_online_status", True) else False
    in_quiet = is_user_in_quiet_hours(user_obj)
    return schemas.ChatMemberOut(
        user_id=user_obj.id,
        username=user_obj.username,
        full_name=user_obj.full_name,
        avatar_url=user_obj.avatar_url,
        bio=getattr(user_obj, "bio", "") or "",
        role=role,
        is_online=visible_online,
        is_banned=user_obj.is_banned,
        is_in_quiet_hours=in_quiet,
        quiet_hours_end=getattr(user_obj, "quiet_hours_end", "08:00") if in_quiet else None,
    )


def serialize_message_for_viewer(
    msg: models.Message,
    viewer_id: str,
    all_users: dict,
    reply_msgs: dict,
    now: datetime.datetime,
) -> schemas.MessageOut:
    is_author = bool(msg.sender_id and msg.sender_id == viewer_id)
    is_locked = bool(msg.visible_at and msg.visible_at.replace(tzinfo=None) > now and not is_author)
    is_expired = bool(msg.type == "ephemeral" and msg.expires_at and msg.expires_at.replace(tzinfo=None) <= now)

    sender_username, sender_avatar = None, None
    out_sender_id = msg.sender_id
    is_own_anonymous = False

    if msg.is_anonymous:
        if is_author:
            out_sender_id = msg.sender_id
            is_own_anonymous = True
        else:
            out_sender_id = None
    elif msg.sender_id:
        user = all_users.get(msg.sender_id)
        if user:
            sender_username = user.username
            sender_avatar = user.avatar_url

    reply_to_content = None
    reply_to_sender = None
    if msg.reply_to_id and msg.reply_to_id in reply_msgs:
        rm = reply_msgs[msg.reply_to_id]
        reply_to_content = summarize_message_preview(rm, viewer_id, now)
        if rm.sender_id and not rm.is_anonymous:
            ru = all_users.get(rm.sender_id)
            if ru:
                reply_to_sender = ru.username

    content = msg.content or ""
    file_url = msg.file_url
    file_name = msg.file_name

    if is_locked or is_expired:
        content = ""
        file_url = None
        file_name = None

    reactions_map = parse_reactions_json(msg.reactions_json, msg.reaction, msg.sender_id)

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


@router.post("/create", response_model=schemas.ChatOutBase)
async def create_chat(
    chat: schemas.ChatCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requested_usernames = list(dict.fromkeys([current_user.username] + list(chat.member_usernames)))
    users = db.query(models.User).filter(models.User.username.in_(requested_usernames)).all()
    if len(users) != len(set(requested_usernames)):
        raise HTTPException(status_code=400, detail="Un ou plusieurs utilisateurs sont introuvables")

    # Anti-duplication and privacy check for Private Chats
    if chat.type == "private":
        if len(users) != 2:
            raise HTTPException(status_code=400, detail="Une discussion privée doit réunir 2 participants")

        other_user = next((u for u in users if u.id != current_user.id), None)
        chat_ids_1 = {m.chat_id for m in db.query(models.ChatMember).filter(models.ChatMember.user_id == users[0].id).all()}
        chat_ids_2 = {m.chat_id for m in db.query(models.ChatMember).filter(models.ChatMember.user_id == users[1].id).all()}
        common_ids = chat_ids_1.intersection(chat_ids_2)
        if common_ids:
            existing_chat = (
                db.query(models.Chat)
                .filter(models.Chat.id.in_(list(common_ids)), models.Chat.type == "private")
                .first()
            )
            if existing_chat:
                # Unhide for caller if previously hidden
                db.query(models.ChatMember).filter(
                    models.ChatMember.chat_id == existing_chat.id,
                    models.ChatMember.user_id == current_user.id,
                ).update({"is_deleted": False}, synchronize_session=False)
                db.commit()
                return existing_chat

        if other_user and not getattr(other_user, "allow_dm_requests", True) and current_user.username != "admin":
            raise HTTPException(
                status_code=403,
                detail="Cet utilisateur n'accepte pas de nouvelles demandes de discussion directe.",
            )

    initial_status = "accepted" if chat.type == "group" or "admin" in requested_usernames else "pending"
    new_chat = models.Chat(
        id=str(uuid.uuid4()),
        type=chat.type,
        name=chat.name.strip() if chat.name else None,
        avatar_url=None,
        status=initial_status,
    )
    db.add(new_chat)
    db.commit()

    ordered_users = []
    for uname in requested_usernames:
        u = next((usr for usr in users if usr.username == uname), None)
        if u:
            ordered_users.append(u)

    for u in ordered_users:
        member = models.ChatMember(
            id=str(uuid.uuid4()),
            chat_id=new_chat.id,
            user_id=u.id,
            role="admin" if u.id == current_user.id else "member",
        )
        db.add(member)

    if chat.initial_message and chat.initial_message.strip():
        intro_msg = models.Message(
            id=str(uuid.uuid4()),
            chat_id=new_chat.id,
            sender_id=current_user.id,
            content=chat.initial_message.strip()[:500],
            type="normal",
            is_anonymous=False,
            reactions_json="{}",
            created_at=datetime.datetime.utcnow(),
        )
        db.add(intro_msg)

    db.commit()
    db.refresh(new_chat)

    await manager.notify_users(
        [u.id for u in ordered_users],
        {"event": "chats_updated", "chat_id": new_chat.id},
    )
    return new_chat


@router.post("/{id}/add_members")
async def add_chat_members(
    id: str,
    payload: schemas.AddMembers,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat or chat.type != "group":
        raise HTTPException(status_code=400, detail="Groupe invalide")

    caller_member = (
        db.query(models.ChatMember)
        .filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == current_user.id)
        .first()
    )
    if not caller_member or caller_member.role != "admin":
        raise HTTPException(status_code=403, detail="Seul l'administrateur du groupe peut ajouter des membres")

    users = db.query(models.User).filter(models.User.username.in_(payload.member_usernames)).all()
    existing_user_ids = {m.user_id for m in db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).all()}

    added_ids = []
    for user in users:
        if user.id not in existing_user_ids:
            member = models.ChatMember(
                id=str(uuid.uuid4()),
                chat_id=chat.id,
                user_id=user.id,
                role="member",
            )
            db.add(member)
            added_ids.append(user.id)

    if added_ids:
        db.commit()
        await manager.notify_users(
            list(existing_user_ids) + added_ids,
            {"event": "chats_updated", "chat_id": chat.id},
        )
    return {"success": True, "added_count": len(added_ids)}


@router.get("/", response_model=List[schemas.ChatListItemOut])
def get_chats(
    user_id: Optional[str] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Optimized chat list with batch-loaded members, unread counts, and last message previews."""
    uid = current_user.id
    now = datetime.datetime.utcnow()

    memberships = (
        db.query(models.ChatMember)
        .filter(models.ChatMember.user_id == uid, models.ChatMember.is_deleted == False)
        .all()
    )
    chat_ids = [m.chat_id for m in memberships]

    if not chat_ids:
        return []

    chats = db.query(models.Chat).filter(models.Chat.id.in_(chat_ids)).all()

    all_members = db.query(models.ChatMember).filter(models.ChatMember.chat_id.in_(chat_ids)).all()
    all_member_user_ids = {m.user_id for m in all_members}
    all_users = (
        {u.id: u for u in db.query(models.User).filter(models.User.id.in_(all_member_user_ids)).all()}
        if all_member_user_ids
        else {}
    )

    members_by_chat = {}
    for m in all_members:
        members_by_chat.setdefault(m.chat_id, []).append(m)

    unread_counts = dict(
        db.query(models.Message.chat_id, func.count(models.Message.id))
        .filter(
            models.Message.chat_id.in_(chat_ids),
            models.Message.sender_id != uid,
            models.Message.is_read == False,
        )
        .group_by(models.Message.chat_id)
        .all()
    )

    # Fetch latest message per chat in a single batch query
    latest_subq = (
        db.query(models.Message.chat_id, func.max(models.Message.created_at).label("max_created"))
        .filter(models.Message.chat_id.in_(chat_ids))
        .group_by(models.Message.chat_id)
        .subquery()
    )
    latest_msgs_rows = (
        db.query(models.Message)
        .join(
            latest_subq,
            (models.Message.chat_id == latest_subq.c.chat_id)
            & (models.Message.created_at == latest_subq.c.max_created),
        )
        .all()
    )
    latest_msg_by_chat = {m.chat_id: m for m in latest_msgs_rows}

    chat_list = []
    for chat in chats:
        members = members_by_chat.get(chat.id, [])
        member_outs = []
        for m in members:
            user_obj = all_users.get(m.user_id)
            if user_obj:
                member_outs.append(build_member_out(user_obj, m.role))

        unread = unread_counts.get(chat.id, 0)
        last_msg = latest_msg_by_chat.get(chat.id)
        last_at = last_msg.created_at if last_msg else chat.created_at
        preview = None
        last_type = None
        if last_msg:
            last_type = last_msg.type
            summary = summarize_message_preview(last_msg, uid, now)
            if last_msg.sender_id == uid and not last_msg.is_anonymous:
                preview = f"Vous : {summary}"
            else:
                preview = summary

        chat_list.append(
            schemas.ChatListItemOut(
                id=chat.id,
                type=chat.type,
                name=chat.name,
                avatar_url=chat.avatar_url,
                status=chat.status,
                created_at=chat.created_at,
                members=member_outs,
                last_message_at=last_at,
                last_message_preview=preview,
                last_message_type=last_type,
                unread_count=unread,
            )
        )

    chat_list.sort(key=lambda x: x.last_message_at or x.created_at, reverse=True)
    return chat_list


async def _mark_chat_messages_read(db: Session, chat_id: str, reader: models.User):
    """Marks incoming messages as read, starts ephemeral TTL on first read, and wipes expired messages."""
    now = datetime.datetime.utcnow()

    # 1. Wipe expired ephemeral payloads in DB for confidentiality
    expired_msgs = (
        db.query(models.Message)
        .filter(
            models.Message.chat_id == chat_id,
            models.Message.type == "ephemeral",
            models.Message.expires_at.isnot(None),
            models.Message.expires_at <= now,
            models.Message.content != "",
        )
        .all()
    )
    dirty = False
    for em in expired_msgs:
        em.content = ""
        em.file_url = None
        em.file_name = None
        dirty = True

    # 2. Mark unread messages from others (excluding still-locked delayed messages!)
    unread_msgs = (
        db.query(models.Message)
        .filter(
            models.Message.chat_id == chat_id,
            models.Message.sender_id != reader.id,
            models.Message.is_read == False,
        )
        .all()
    )

    marked_any = False
    ephemeral_updates = []
    for m in unread_msgs:
        if m.visible_at and m.visible_at.replace(tzinfo=None) > now:
            continue
        m.is_read = True
        if not m.read_at:
            m.read_at = now
        if m.type == "ephemeral" and m.ttl and not m.expires_at:
            m.expires_at = now + datetime.timedelta(seconds=m.ttl)
            ephemeral_updates.append(
                {
                    "id": m.id,
                    "read_at": m.read_at.isoformat(),
                    "expires_at": m.expires_at.isoformat(),
                }
            )
        marked_any = True
        dirty = True

    if dirty:
        db.commit()

    if marked_any:
        if getattr(reader, "read_receipts_enabled", True) or ephemeral_updates:
            await manager.broadcast_read_receipt(chat_id, reader.id, ephemeral_updates)
        await manager.notify_users([reader.id], {"event": "chats_updated", "chat_id": chat_id})


@router.post("/{id}/read")
async def mark_chat_read(
    id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = (
        db.query(models.ChatMember)
        .filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == current_user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Accès non autorisé à cette discussion")
    await _mark_chat_messages_read(db, id, current_user)
    return {"success": True}


@router.get("/{id}", response_model=schemas.ChatOutDetail)
async def get_chat(
    id: str,
    user_id: Optional[str] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Discussion introuvable")

    members = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).all()
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Vous ne faites pas partie de cette discussion")

    await _mark_chat_messages_read(db, id, current_user)

    now = datetime.datetime.utcnow()
    messages = (
        db.query(models.Message)
        .filter(models.Message.chat_id == id)
        .order_by(models.Message.created_at.asc())
        .all()
    )

    reply_ids = {msg.reply_to_id for msg in messages if msg.reply_to_id}
    reply_msgs = (
        {m.id: m for m in db.query(models.Message).filter(models.Message.id.in_(reply_ids)).all()}
        if reply_ids
        else {}
    )

    all_user_ids = {m.user_id for m in members}
    all_user_ids.update({msg.sender_id for msg in messages if msg.sender_id})
    all_user_ids.update({rm.sender_id for rm in reply_msgs.values() if rm.sender_id})
    all_users = (
        {u.id: u for u in db.query(models.User).filter(models.User.id.in_(all_user_ids)).all()}
        if all_user_ids
        else {}
    )

    member_outs = []
    for m in members:
        u = all_users.get(m.user_id)
        if u:
            member_outs.append(build_member_out(u, m.role))

    msg_outs = [
        serialize_message_for_viewer(msg, current_user.id, all_users, reply_msgs, now)
        for msg in messages
    ]

    return {
        "id": chat.id,
        "type": chat.type,
        "name": chat.name,
        "avatar_url": chat.avatar_url,
        "status": chat.status,
        "created_at": chat.created_at,
        "members": member_outs,
        "messages": msg_outs,
    }


@router.patch("/{id}/accept", response_model=schemas.ChatOutBase)
async def accept_chat(
    id: str,
    user_id: Optional[str] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Discussion introuvable")

    members = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).all()
    member = next((m for m in members if m.user_id == current_user.id), None)
    if not member:
        raise HTTPException(status_code=403, detail="Accès refusé")

    if chat.type == "private" and chat.status == "pending" and member.role == "admin":
        raise HTTPException(status_code=403, detail="Seul le destinataire peut accepter l'invitation")

    chat.status = "accepted"
    db.commit()
    db.refresh(chat)

    await manager.notify_users(
        [m.user_id for m in members],
        {"event": "chats_updated", "chat_id": chat.id},
    )
    return chat


@router.post("/{id}/decline")
async def decline_chat(
    id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Discussion introuvable")

    members = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).all()
    member = next((m for m in members if m.user_id == current_user.id), None)
    if not member:
        raise HTTPException(status_code=403, detail="Accès refusé")

    member_ids = [m.user_id for m in members]
    db.query(models.Message).filter(models.Message.chat_id == id).delete(synchronize_session=False)
    db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).delete(synchronize_session=False)
    db.delete(chat)
    db.commit()

    await manager.notify_users(member_ids, {"event": "chats_updated", "chat_id": id})
    return {"success": True}


@router.delete("/{id}")
async def delete_chat(
    id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat or chat.type != "group":
        raise HTTPException(status_code=400, detail="Groupe introuvable")

    members = db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).all()
    caller = next((m for m in members if m.user_id == current_user.id), None)
    if not caller or caller.role != "admin":
        raise HTTPException(status_code=403, detail="Seul l'administrateur peut supprimer ce groupe")

    member_ids = [m.user_id for m in members]
    db.query(models.Message).filter(models.Message.chat_id == id).delete(synchronize_session=False)
    db.query(models.ChatMember).filter(models.ChatMember.chat_id == id).delete(synchronize_session=False)
    db.delete(chat)
    db.commit()

    await manager.notify_users(member_ids, {"event": "chats_updated", "chat_id": id})
    return {"success": True}


@router.delete("/{id}/leave")
async def leave_or_hide_chat(
    id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Discussion introuvable")

    member = (
        db.query(models.ChatMember)
        .filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == current_user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=400, detail="Vous ne faites pas partie de cette discussion")

    if chat.type == "group":
        db.delete(member)
    else:
        member.is_deleted = True
    db.commit()

    await manager.notify_users([current_user.id], {"event": "chats_updated", "chat_id": id})
    return {"success": True}


@router.delete("/{id}/members/{target_user_id}")
async def kick_chat_member(
    id: str,
    target_user_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(models.Chat).filter(models.Chat.id == id).first()
    if not chat or chat.type != "group":
        raise HTTPException(status_code=400, detail="Groupe introuvable")

    caller = (
        db.query(models.ChatMember)
        .filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == current_user.id)
        .first()
    )
    if not caller or caller.role != "admin":
        raise HTTPException(status_code=403, detail="Seul l'administrateur peut retirer un membre")

    if target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Utilisez l'option quitter le groupe")

    target_member = (
        db.query(models.ChatMember)
        .filter(models.ChatMember.chat_id == id, models.ChatMember.user_id == target_user_id)
        .first()
    )
    if not target_member:
        raise HTTPException(status_code=404, detail="Membre introuvable")

    db.delete(target_member)
    db.commit()

    await manager.notify_users([target_user_id, current_user.id], {"event": "chats_updated", "chat_id": id})
    return {"success": True}


@router.post("/announcement")
async def send_announcement(
    payload: schemas.AnnouncementCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Action réservée à l'administrateur.")

    users = db.query(models.User).filter(models.User.username != "admin", models.User.is_banned == False).all()
    if not users:
        return {"success": True, "sent_count": 0}

    # Preload admin's private chats once to eliminate N+1 queries
    admin_memberships = db.query(models.ChatMember).filter(models.ChatMember.user_id == current_user.id).all()
    admin_chat_ids = [m.chat_id for m in admin_memberships]
    private_chats = (
        {
            c.id: c
            for c in db.query(models.Chat)
            .filter(models.Chat.id.in_(admin_chat_ids), models.Chat.type == "private")
            .all()
        }
        if admin_chat_ids
        else {}
    )
    other_members = (
        db.query(models.ChatMember)
        .filter(
            models.ChatMember.chat_id.in_(list(private_chats.keys())),
            models.ChatMember.user_id != current_user.id,
        )
        .all()
        if private_chats
        else []
    )
    chat_by_target_user = {m.user_id: private_chats[m.chat_id] for m in other_members if m.chat_id in private_chats}

    sent_count = 0
    now = datetime.datetime.utcnow()
    broadcast_queue = []

    for u in users:
        existing_chat = chat_by_target_user.get(u.id)
        if not existing_chat:
            existing_chat = models.Chat(
                id=str(uuid.uuid4()),
                type="private",
                name=None,
                avatar_url=None,
                status="accepted",
            )
            db.add(existing_chat)
            db.flush()
            db.add(
                models.ChatMember(
                    id=str(uuid.uuid4()),
                    chat_id=existing_chat.id,
                    user_id=current_user.id,
                    role="admin",
                )
            )
            db.add(
                models.ChatMember(
                    id=str(uuid.uuid4()),
                    chat_id=existing_chat.id,
                    user_id=u.id,
                    role="member",
                )
            )
        else:
            db.query(models.ChatMember).filter(models.ChatMember.chat_id == existing_chat.id).update(
                {"is_deleted": False}, synchronize_session=False
            )

        new_msg = models.Message(
            id=str(uuid.uuid4()),
            chat_id=existing_chat.id,
            sender_id=current_user.id,
            content=payload.content,
            type="normal",
            is_anonymous=False,
            ttl=None,
            reaction=None,
            reactions_json="{}",
            is_read=False,
            visible_at=None,
            created_at=now,
            expires_at=None,
        )
        db.add(new_msg)
        broadcast_queue.append((existing_chat.id, u.id, new_msg))
        sent_count += 1

    db.commit()

    for chat_id, target_uid, new_msg in broadcast_queue:
        msg_out = schemas.MessageOut(
            id=new_msg.id,
            chat_id=new_msg.chat_id,
            sender_id=current_user.id,
            sender_username=current_user.username,
            sender_avatar=current_user.avatar_url,
            content=new_msg.content,
            type=new_msg.type,
            is_anonymous=False,
            is_own_anonymous=False,
            ttl=None,
            reaction=None,
            reactions={},
            is_read=False,
            visible_at=None,
            created_at=new_msg.created_at,
            expires_at=None,
        )
        await manager.broadcast_to_chat(chat_id, msg_out.model_dump(mode="json"))

    await manager.notify_users(
        [u.id for u in users] + [current_user.id],
        {"event": "chats_updated"},
    )
    return {"success": True, "sent_count": sent_count}
