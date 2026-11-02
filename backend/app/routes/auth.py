from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.database import get_db
from .. import models, schemas
from ..services.auth_utils import create_access_token, is_user_in_quiet_hours
import uuid
import bcrypt
import datetime
import os

router = APIRouter()

WELCOME_MESSAGE_CONTENT = (
    "Bienvenue sur IQChat.\n\n"
    "Vous rejoignez un espace de messagerie conçu pour le calme, la confidentialité et la communication intentionnelle (Slow Communication).\n\n"
    "Voici les modes d'échange à votre disposition :\n"
    "1. Messages Différés : Programmez la date et l'heure de visibilité d'un message afin d'écrire librement sans interrompre le repos ou la concentration de vos proches.\n"
    "2. Messages Éphémères : Définissez une durée de vie (5s à 24h) qui ne démarre qu'au moment où votre destinataire lit le message, puis s'efface définitivement.\n"
    "3. Messages Cachés : Envoyez un message flouté qui ne se dévoile qu'après une action volontaire du lecteur.\n"
    "4. Mode Anonyme : Masquez votre identité sur un message ponctuel pour vous exprimer librement.\n"
    "5. Mini-Jeux au tour par tour : Lancez une partie de Morpion, Puissance 4, Pierre-Papier-Ciseaux ou Mot Mystère directement dans la conversation.\n\n"
    "Rendez-vous dans Paramètres pour configurer vos heures de quiétude, vos préférences de confidentialité et votre confort de lecture.\n\n"
    "— L'Administration IQChat"
)


def send_welcome_message(db: Session, new_user: models.User):
    admin_user = db.query(models.User).filter(models.User.username == "admin").first()
    if not admin_user:
        default_admin_pwd = os.getenv("ADMIN_INITIAL_PASSWORD", "admin_royal_gold_iqchat_pwd_2026")
        hashed = bcrypt.hashpw(default_admin_pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        admin_user = models.User(
            id=str(uuid.uuid4()),
            username="admin",
            email="admin@iqchat.app",
            full_name="Administration IQChat",
            bio="Compte officiel d'accompagnement et d'annonces.",
            hashed_password=hashed,
            avatar_url="https://api.dicebear.com/7.x/bottts/png?seed=admin",
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

    if new_user.id == admin_user.id:
        return

    chat_ids_admin = {
        m.chat_id for m in db.query(models.ChatMember).filter(models.ChatMember.user_id == admin_user.id).all()
    }
    chat_ids_user = {
        m.chat_id for m in db.query(models.ChatMember).filter(models.ChatMember.user_id == new_user.id).all()
    }
    common_ids = chat_ids_admin.intersection(chat_ids_user)

    existing_chat = None
    if common_ids:
        existing_chat = (
            db.query(models.Chat)
            .filter(models.Chat.id.in_(list(common_ids)), models.Chat.type == "private")
            .first()
        )

    if not existing_chat:
        existing_chat = models.Chat(
            id=str(uuid.uuid4()),
            type="private",
            name=None,
            avatar_url=None,
            status="accepted",
        )
        db.add(existing_chat)
        db.commit()

        member_admin = models.ChatMember(
            id=str(uuid.uuid4()),
            chat_id=existing_chat.id,
            user_id=admin_user.id,
            role="admin",
        )
        member_user = models.ChatMember(
            id=str(uuid.uuid4()),
            chat_id=existing_chat.id,
            user_id=new_user.id,
            role="member",
        )
        db.add(member_admin)
        db.add(member_user)
        db.commit()

    welcome_msg_exists = (
        db.query(models.Message)
        .filter(
            models.Message.chat_id == existing_chat.id,
            models.Message.sender_id == admin_user.id,
        )
        .first()
    )

    if not welcome_msg_exists:
        welcome_msg = models.Message(
            id=str(uuid.uuid4()),
            chat_id=existing_chat.id,
            sender_id=admin_user.id,
            content=WELCOME_MESSAGE_CONTENT,
            type="normal",
            is_anonymous=False,
            ttl=None,
            reaction=None,
            reactions_json="{}",
            is_read=False,
            visible_at=None,
            created_at=datetime.datetime.utcnow(),
            expires_at=None,
        )
        db.add(welcome_msg)
        db.commit()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def serialize_user_out(user: models.User, is_online: bool = False) -> dict:
    data = schemas.UserOut.model_validate(user).model_dump()
    data["is_online"] = is_online if getattr(user, "show_online_status", True) else False
    data["is_in_quiet_hours"] = is_user_in_quiet_hours(user)
    return data


@router.post("/register")
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if len(user.password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caractères")

    clean_username = user.username.strip()
    clean_email = user.email.strip().lower()
    if not clean_username:
        raise HTTPException(status_code=400, detail="Nom d'utilisateur invalide")

    db_user = (
        db.query(models.User)
        .filter((models.User.username == clean_username) | (models.User.email == clean_email))
        .first()
    )
    if db_user:
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur ou cet email est déjà utilisé")

    avatar = user.avatar_url or f"https://api.dicebear.com/7.x/adventurer/png?seed={clean_username}"
    if "api.dicebear.com" in avatar and "/svg?" in avatar:
        avatar = avatar.replace("/svg?", "/png?")

    new_user = models.User(
        id=str(uuid.uuid4()),
        username=clean_username,
        email=clean_email,
        full_name=user.full_name.strip(),
        hashed_password=get_password_hash(user.password),
        avatar_url=avatar,
        bio="",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    try:
        send_welcome_message(db, new_user)
    except Exception as e:
        print(f"Error sending welcome message: {e}")

    token = create_access_token(data={"sub": new_user.id, "username": new_user.username})

    return {
        "token": token,
        "user": serialize_user_out(new_user, is_online=True),
    }


@router.post("/login")
def login(creds: schemas.UserLogin, db: Session = Depends(get_db)):
    ident = creds.identifier.strip()
    user = (
        db.query(models.User)
        .filter((models.User.email == ident.lower()) | (models.User.email == ident) | (models.User.username == ident))
        .first()
    )

    if not user:
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe invalide")

    if user.is_banned:
        raise HTTPException(status_code=403, detail="Votre compte a été suspendu par l'administration.")

    if not verify_password(creds.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe invalide")

    try:
        send_welcome_message(db, user)
    except Exception as e:
        print(f"Error sending welcome message: {e}")

    token = create_access_token(data={"sub": user.id, "username": user.username})

    return {
        "token": token,
        "user": serialize_user_out(user, is_online=True),
    }
