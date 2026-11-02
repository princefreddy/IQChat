from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.database import get_db
from .. import models, schemas
from ..routes.auth import get_password_hash, verify_password
from ..services.websockets import manager
from ..services.auth_utils import get_current_user, is_user_in_quiet_hours

router = APIRouter()


def format_user_out(u: models.User) -> dict:
    u_dict = schemas.UserOut.model_validate(u).model_dump()
    raw_online = manager.is_user_online(u.id)
    u_dict["is_online"] = raw_online if getattr(u, "show_online_status", True) else False
    u_dict["is_in_quiet_hours"] = is_user_in_quiet_hours(u)
    return u_dict


@router.get("/", response_model=list[schemas.UserOut])
def get_all_users(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    return [format_user_out(u) for u in users]


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    return format_user_out(current_user)


@router.get("/me/contacts", response_model=list[schemas.UserOut])
def get_my_contacts(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    my_memberships = db.query(models.ChatMember).filter(models.ChatMember.user_id == current_user.id).all()
    chat_ids = [m.chat_id for m in my_memberships]

    if not chat_ids:
        return []

    private_accepted_chats = (
        db.query(models.Chat)
        .filter(
            models.Chat.id.in_(chat_ids),
            models.Chat.type == "private",
            models.Chat.status == "accepted",
        )
        .all()
    )

    accepted_chat_ids = [c.id for c in private_accepted_chats]
    if not accepted_chat_ids:
        return []

    other_members = (
        db.query(models.ChatMember)
        .filter(
            models.ChatMember.chat_id.in_(accepted_chat_ids),
            models.ChatMember.user_id != current_user.id,
        )
        .all()
    )

    other_user_ids = {m.user_id for m in other_members}
    if not other_user_ids:
        return []

    contacts = db.query(models.User).filter(models.User.id.in_(other_user_ids)).all()
    return [format_user_out(u) for u in contacts]


@router.get("/{username}", response_model=schemas.UserOut)
def get_user(username: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return format_user_out(user)


@router.get("/id/{user_id}", response_model=schemas.UserOut)
def get_user_by_id(user_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return format_user_out(user)


@router.put("/me", response_model=schemas.UserOut)
def update_profile(
    updates: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if updates.full_name is not None:
        cleaned = updates.full_name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Le nom complet ne peut pas être vide")
        current_user.full_name = cleaned

    if updates.avatar_url is not None:
        avatar = updates.avatar_url.strip()
        if "api.dicebear.com" in avatar and "/svg?" in avatar:
            avatar = avatar.replace("/svg?", "/png?")
        current_user.avatar_url = avatar

    if updates.bio is not None:
        current_user.bio = updates.bio.strip()[:160]

    if updates.password:
        if len(updates.password) < 6:
            raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caractères")
        if updates.current_password is not None and updates.current_password != "":
            if not verify_password(updates.current_password, current_user.hashed_password):
                raise HTTPException(status_code=400, detail="Le mot de passe actuel est incorrect")
        current_user.hashed_password = get_password_hash(updates.password)

    # Privacy & Security settings
    if updates.show_online_status is not None:
        current_user.show_online_status = updates.show_online_status
    if updates.read_receipts_enabled is not None:
        current_user.read_receipts_enabled = updates.read_receipts_enabled
    if updates.allow_dm_requests is not None:
        current_user.allow_dm_requests = updates.allow_dm_requests

    # Slow Communication & Wellbeing settings
    if updates.quiet_hours_enabled is not None:
        current_user.quiet_hours_enabled = updates.quiet_hours_enabled
    if updates.quiet_hours_start is not None:
        current_user.quiet_hours_start = updates.quiet_hours_start
    if updates.quiet_hours_end is not None:
        current_user.quiet_hours_end = updates.quiet_hours_end
    if updates.default_ephemeral_ttl is not None:
        if updates.default_ephemeral_ttl in (5, 10, 60, 3600, 7200, 86400):
            current_user.default_ephemeral_ttl = updates.default_ephemeral_ttl
    if updates.auto_reset_mode is not None:
        current_user.auto_reset_mode = updates.auto_reset_mode

    # Comfort & Display settings
    if updates.font_size is not None and updates.font_size in ("compact", "normal", "large"):
        current_user.font_size = updates.font_size
    if updates.enter_to_send is not None:
        current_user.enter_to_send = updates.enter_to_send
    if updates.haptics_enabled is not None:
        current_user.haptics_enabled = updates.haptics_enabled
    if updates.link_previews_enabled is not None:
        current_user.link_previews_enabled = updates.link_previews_enabled

    db.commit()
    db.refresh(current_user)
    return format_user_out(current_user)


@router.delete("/me")
def delete_my_account(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.username == "admin":
        raise HTTPException(status_code=400, detail="Impossible de supprimer le compte administrateur principal.")

    db.query(models.PublicationReaction).filter(models.PublicationReaction.user_id == current_user.id).delete()
    user_pub_ids = [
        p.id for p in db.query(models.Publication).filter(models.Publication.author_id == current_user.id).all()
    ]
    if user_pub_ids:
        db.query(models.PublicationReaction).filter(
            models.PublicationReaction.publication_id.in_(user_pub_ids)
        ).delete(synchronize_session=False)
        db.query(models.Publication).filter(models.Publication.id.in_(user_pub_ids)).delete(synchronize_session=False)

    db.query(models.Message).filter(models.Message.sender_id == current_user.id).update(
        {"sender_id": None, "is_anonymous": True}, synchronize_session=False
    )
    db.query(models.ChatMember).filter(models.ChatMember.user_id == current_user.id).delete(synchronize_session=False)
    db.delete(current_user)
    db.commit()
    return {"success": True}


@router.put("/{target_user_id}/ban")
def toggle_ban_user(
    target_user_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Action réservée à l'administrateur.")

    target = db.query(models.User).filter(models.User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    if target.username == "admin":
        raise HTTPException(status_code=400, detail="Impossible de suspendre l'administrateur.")

    target.is_banned = not target.is_banned
    db.commit()
    db.refresh(target)

    return {"success": True, "is_banned": target.is_banned}
