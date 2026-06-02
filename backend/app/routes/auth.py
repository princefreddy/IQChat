from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..db.database import get_db
from .. import models, schemas
from ..services.auth_utils import create_access_token
import uuid
import bcrypt
import datetime

router = APIRouter()

WELCOME_MESSAGE_CONTENT = (
    "👑 Bienvenue au Royaume d'IQChat ! 👑\n\n"
    "Bonjour et bienvenue dans notre havre de paix numérique. En créant ce compte, vous rejoignez une messagerie conçue pour être saine, intentionnelle et respectueuse de votre esprit.\n\n"
    "🧠 Pourquoi IQChat est différent ?\n"
    "Les réseaux sociaux traditionnels exploitent vos circuits cérébraux en créant des boucles de dopamine artificielles et addictives (notifications incessantes, flux infini, validation sociale instantanée). Ces pics de dopamine fatiguent votre attention et créent du stress.\n"
    "IQChat a été pensé pour inverser cette tendance. Ici, nous valorisons la \"Slow Communication\" (communication intentionnelle) et protégeons votre charge mentale grâce à des fonctionnalités uniques :\n\n"
    "⏳ Les fonctionnalités phares :\n"
    "1. Les Messages Différés (⏰) : Programmez l'envoi de vos messages. Cela vous permet d'écrire quand vous le souhaitez, sans perturber le sommeil ou la concentration de vos proches en différant la lecture.\n"
    "2. Les Messages Éphémères (⏳) : Déterminez une durée de vie pour vos messages (5s, 10s, 1h, 24h). Une fois le temps écoulé, ils disparaissent à jamais, allégeant l'historique et libérant l'esprit.\n"
    "3. Les Messages Cachés (👀) : Le contenu est flouté et ne se révèle que si le destinataire clique dessus. Cela évite le balayage passif et force une lecture active et choisie.\n"
    "4. L'Anonymat à la demande (👤) : Activez le mode anonyme pour échanger de manière libre et désinhibée, sans la pression de l'image sociale.\n"
    "5. Catalogue de Mini-Jeux (🎮) : Jouez au Morpion, à Puissance 4, à Pierre-Papier-Ciseaux ou au Mot Mystère directement dans vos bulles de chat au tour par tour asynchrone, favorisant un divertissement calme et partagé.\n\n"
    "⚙️ Vos paramètres pour un esprit serein :\n"
    "Dans les onglets et options d'envoi, vous pouvez configurer précisément la visibilité et la durée de vie de vos messages. Prenez le contrôle de vos intérations.\n\n"
    "Nous espérons que vous trouverez ici un espace propice à des échanges authentiques et apaisés.\n\n"
    "Votre Administrateur Suprême 🔱"
)

def send_welcome_message(db: Session, new_user: models.User):
    # 1. Get or create the admin user
    admin_user = db.query(models.User).filter(models.User.username == 'admin').first()
    if not admin_user:
        # Create default admin user if not exists
        import bcrypt
        hashed = bcrypt.hashpw('admin_royal_gold_iqchat_pwd_2026'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        admin_user = models.User(
            id=str(uuid.uuid4()),
            username='admin',
            email='admin@iqchat.app',
            full_name='Administrateur Suprême',
            hashed_password=hashed,
            avatar_url='https://api.dicebear.com/7.x/bottts/svg?seed=admin'
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

    # 2. Check if a private chat already exists between admin and the new user
    chat_ids_admin = {m.chat_id for m in db.query(models.ChatMember).filter(models.ChatMember.user_id == admin_user.id).all()}
    chat_ids_user = {m.chat_id for m in db.query(models.ChatMember).filter(models.ChatMember.user_id == new_user.id).all()}
    common_ids = chat_ids_admin.intersection(chat_ids_user)
    
    existing_chat = None
    if common_ids:
        existing_chat = db.query(models.Chat).filter(models.Chat.id.in_(list(common_ids)), models.Chat.type == 'private').first()

    if not existing_chat:
        # Create private chat
        existing_chat = models.Chat(
            id=str(uuid.uuid4()),
            type='private',
            name=None,
            avatar_url=None,
            status='accepted'
        )
        db.add(existing_chat)
        db.commit()

        # Add members
        member_admin = models.ChatMember(
            id=str(uuid.uuid4()),
            chat_id=existing_chat.id,
            user_id=admin_user.id,
            role="admin"
        )
        member_user = models.ChatMember(
            id=str(uuid.uuid4()),
            chat_id=existing_chat.id,
            user_id=new_user.id,
            role="member"
        )
        db.add(member_admin)
        db.add(member_user)
        db.commit()

    # 3. Check if a welcome message or any message from admin already exists in this chat
    welcome_msg_exists = db.query(models.Message).filter(
        models.Message.chat_id == existing_chat.id,
        models.Message.sender_id == admin_user.id
    ).first()

    if not welcome_msg_exists:
        welcome_msg = models.Message(
            id=str(uuid.uuid4()),
            chat_id=existing_chat.id,
            sender_id=admin_user.id,
            content=WELCOME_MESSAGE_CONTENT,
            type='normal',
            is_anonymous=False,
            ttl=None,
            reaction=None,
            is_read=False,
            visible_at=None,
            created_at=datetime.datetime.utcnow(),
            expires_at=None
        )
        db.add(welcome_msg)
        db.commit()

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

@router.post("/register")
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Password validation
    if len(user.password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caractères")
    
    db_user = db.query(models.User).filter((models.User.username == user.username) | (models.User.email == user.email)).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    
    new_user = models.User(
        id=str(uuid.uuid4()),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=get_password_hash(user.password),
        avatar_url=user.avatar_url or f"https://api.dicebear.com/7.x/adventurer/svg?seed={user.username}"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Send automatic welcome message from admin
    try:
        send_welcome_message(db, new_user)
    except Exception as e:
        print(f"Error sending welcome message: {e}")
    
    # Generate JWT token
    token = create_access_token(data={"sub": new_user.id, "username": new_user.username})
    
    return {
        "token": token,
        "user": schemas.UserOut.model_validate(new_user).model_dump()
    }

@router.post("/login")
def login(creds: schemas.UserLogin, db: Session = Depends(get_db)):
    # Support login by email OR username
    user = db.query(models.User).filter(
        (models.User.email == creds.identifier) | (models.User.username == creds.identifier)
    ).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe invalide")
        
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Votre compte a été banni par l'Administrateur Suprême.")
        
    if not verify_password(creds.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe invalide")
    
    # Send automatic welcome message from admin if they don't have one yet
    try:
        send_welcome_message(db, user)
    except Exception as e:
        print(f"Error sending welcome message: {e}")

    # Generate JWT token
    token = create_access_token(data={"sub": user.id, "username": user.username})
    
    return {
        "token": token,
        "user": schemas.UserOut.model_validate(user).model_dump()
    }
