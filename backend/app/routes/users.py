from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.database import get_db
from .. import models, schemas
from ..routes.auth import get_password_hash
from ..services.websockets import manager
from ..services.auth_utils import get_current_user

router = APIRouter()

@router.get("/", response_model=list[schemas.UserOut])
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    out = []
    for u in users:
        u_dict = schemas.UserOut.model_validate(u).model_dump()
        u_dict['is_online'] = manager.is_user_online(u.id)
        out.append(u_dict)
    return out

@router.get("/me/contacts", response_model=list[schemas.UserOut])
def get_my_contacts(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    my_memberships = db.query(models.ChatMember).filter(models.ChatMember.user_id == current_user.id).all()
    chat_ids = [m.chat_id for m in my_memberships]
    
    private_accepted_chats = db.query(models.Chat).filter(
        models.Chat.id.in_(chat_ids),
        models.Chat.type == 'private',
        models.Chat.status == 'accepted'
    ).all()
    
    accepted_chat_ids = [c.id for c in private_accepted_chats]
    
    other_members = db.query(models.ChatMember).filter(
        models.ChatMember.chat_id.in_(accepted_chat_ids),
        models.ChatMember.user_id != current_user.id
    ).all()
    
    other_user_ids = {m.user_id for m in other_members}
    contacts = db.query(models.User).filter(models.User.id.in_(other_user_ids)).all()
    
    out = []
    for u in contacts:
        u_dict = schemas.UserOut.model_validate(u).model_dump()
        u_dict['is_online'] = manager.is_user_online(u.id)
        out.append(u_dict)
    return out

@router.get("/{username}", response_model=schemas.UserOut)
def get_user(username: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    u_dict = schemas.UserOut.model_validate(user).model_dump()
    u_dict['is_online'] = manager.is_user_online(user.id)
    return u_dict

@router.get("/id/{user_id}", response_model=schemas.UserOut)
def get_user_by_id(user_id: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    u_dict = schemas.UserOut.model_validate(user).model_dump()
    u_dict['is_online'] = manager.is_user_online(user.id)
    return u_dict

@router.put("/me", response_model=schemas.UserOut)
def update_profile(updates: schemas.UserUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if updates.full_name:
        current_user.full_name = updates.full_name
    if updates.avatar_url:
        current_user.avatar_url = updates.avatar_url
    if updates.password:
        current_user.hashed_password = get_password_hash(updates.password)
        
    db.commit()
    db.refresh(current_user)
    
    u_dict = schemas.UserOut.model_validate(current_user).model_dump()
    u_dict['is_online'] = manager.is_user_online(current_user.id)
    return u_dict

@router.put("/{target_user_id}/ban")
def toggle_ban_user(target_user_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.username != 'admin':
        raise HTTPException(status_code=403, detail="Seul l'Administrateur Suprême peut bannir.")
        
    target = db.query(models.User).filter(models.User.id == target_user_id).first()
    if not target: raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    if target.username == 'admin': raise HTTPException(status_code=400, detail="Impossible de bannir l'Administrateur Suprême.")
    
    target.is_banned = not target.is_banned
    db.commit()
    db.refresh(target)
    
    return {"success": True, "is_banned": target.is_banned}
