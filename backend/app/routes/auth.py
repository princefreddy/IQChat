from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..db.database import get_db
from .. import models, schemas
from ..services.auth_utils import create_access_token
import uuid
import bcrypt

router = APIRouter()

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
    
    # Generate JWT token
    token = create_access_token(data={"sub": user.id, "username": user.username})
    
    return {
        "token": token,
        "user": schemas.UserOut.model_validate(user).model_dump()
    }
