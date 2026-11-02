"""
JWT Authentication Utilities for IQChat.
Provides token creation, verification, user quiet-hours evaluation, and FastAPI dependencies.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from ..db.database import get_db
from .. import models

SECRET_KEY = os.getenv("SECRET_KEY", "iqchat-royal-secret-key-2026-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 72  # 3 days


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT token with user data."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """Verify and decode a JWT token. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )


def resolve_ws_user_id(token: Optional[str], fallback_user_id: Optional[str] = None) -> Optional[str]:
    """Resolve user_id from a WebSocket JWT token (with safe transition fallback)."""
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload.get("sub")
        except JWTError:
            return None
    return fallback_user_id


def is_user_in_quiet_hours(user: models.User) -> bool:
    """Evaluate whether a user is currently within their configured quiet hours."""
    if not getattr(user, "quiet_hours_enabled", False):
        return False
    start_str = getattr(user, "quiet_hours_start", "22:00") or "22:00"
    end_str = getattr(user, "quiet_hours_end", "08:00") or "08:00"
    try:
        sh, sm = [int(x) for x in start_str.split(":")[:2]]
        eh, em = [int(x) for x in end_str.split(":")[:2]]
        now = datetime.now()
        cur_mins = now.hour * 60 + now.minute
        start_mins = sh * 60 + sm
        end_mins = eh * 60 + em
        if start_mins <= end_mins:
            return start_mins <= cur_mins < end_mins
        # Overnight range (e.g. 22:00 -> 08:00)
        return cur_mins >= start_mins or cur_mins < end_mins
    except Exception:
        return False


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> models.User:
    """
    FastAPI dependency that extracts and validates the current user from
    the signed Authorization: Bearer <token> JWT header.
    """
    user_id = None

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        payload = verify_token(token)
        user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise",
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable",
        )

    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte a été banni par l'Administrateur Suprême.",
        )

    return user
