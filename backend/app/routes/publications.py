from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
import uuid
import datetime

from ..db.database import get_db
from .. import models
from ..services.auth_utils import get_current_user

router = APIRouter()


class PublicationCreate(BaseModel):
    content: str = ""
    repost_of_id: Optional[str] = None


class ReactionUpdate(BaseModel):
    is_like: Optional[bool] = None


class RepostOriginalOut(BaseModel):
    id: str
    content: str
    author_username: str
    author_full_name: Optional[str] = None
    author_avatar: Optional[str] = None
    created_at: datetime.datetime


class PublicationOut(BaseModel):
    id: str
    content: str
    created_at: datetime.datetime
    author_id: str
    author_username: str
    author_avatar: Optional[str] = None
    author_full_name: Optional[str] = None
    likes: int
    dislikes: int = 0
    user_reaction: Optional[bool] = None
    is_supreme_admin: bool = False
    is_pinned: bool = False
    reposts_count: int = 0
    repost_of_id: Optional[str] = None
    repost_original: Optional[RepostOriginalOut] = None


BAD_WORDS = ["porn", "sex", "nude", "salope", "pd", "pute", "connard", "fuck", "bitch", "shit", "merde", "putain"]


@router.get("/latest_time")
def get_latest_time(db: Session = Depends(get_db)):
    latest = db.query(models.Publication).order_by(models.Publication.created_at.desc()).first()
    if latest:
        return {"latest_time": latest.created_at.isoformat()}
    return {"latest_time": None}


@router.post("/")
def create_publication(
    payload: PublicationCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = (payload.content or "").strip()
    if not text and not payload.repost_of_id:
        raise HTTPException(status_code=400, detail="La publication ne peut pas être vide.")

    text_lower = text.lower()
    if any(bad_word in text_lower.split() for bad_word in BAD_WORDS):
        raise HTTPException(status_code=400, detail="Contenu inapproprié détecté.")

    if len(text) > 500:
        raise HTTPException(status_code=400, detail="La publication ne peut pas dépasser 500 caractères.")

    if payload.repost_of_id:
        orig = db.query(models.Publication).filter(models.Publication.id == payload.repost_of_id).first()
        if not orig:
            raise HTTPException(status_code=404, detail="Publication originale introuvable.")

    pub = models.Publication(
        id=str(uuid.uuid4()),
        author_id=current_user.id,
        content=text,
        repost_of_id=payload.repost_of_id,
    )
    db.add(pub)
    db.commit()
    return {"success": True, "id": pub.id}


@router.get("/")
def get_publications(
    skip: int = 0,
    limit: int = 40,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Optimized publications feed with batch-loaded authors, toggleable likes, and structured reposts."""
    pubs = (
        db.query(models.Publication)
        .order_by(models.Publication.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    if not pubs:
        return []

    pub_ids = [p.id for p in pubs]
    repost_orig_ids = {p.repost_of_id for p in pubs if p.repost_of_id}
    orig_pubs = (
        {op.id: op for op in db.query(models.Publication).filter(models.Publication.id.in_(repost_orig_ids)).all()}
        if repost_orig_ids
        else {}
    )

    author_ids = {p.author_id for p in pubs}
    author_ids.update({op.author_id for op in orig_pubs.values()})
    authors = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(author_ids)).all()}

    likes_q = dict(
        db.query(models.PublicationReaction.publication_id, func.count(models.PublicationReaction.id))
        .filter(
            models.PublicationReaction.publication_id.in_(pub_ids),
            models.PublicationReaction.is_like == True,
        )
        .group_by(models.PublicationReaction.publication_id)
        .all()
    )

    user_reactions = {}
    if current_user:
        for r in (
            db.query(models.PublicationReaction)
            .filter(
                models.PublicationReaction.publication_id.in_(pub_ids),
                models.PublicationReaction.user_id == current_user.id,
            )
            .all()
        ):
            user_reactions[r.publication_id] = r.is_like

    reposts = dict(
        db.query(models.Publication.repost_of_id, func.count(models.Publication.id))
        .filter(models.Publication.repost_of_id.in_(pub_ids))
        .group_by(models.Publication.repost_of_id)
        .all()
    )

    pinned_pub_id = None
    for pub in pubs:
        author = authors.get(pub.author_id)
        if author and author.username == "admin":
            pinned_pub_id = pub.id
            break

    results = []
    for pub in pubs:
        author = authors.get(pub.author_id)
        repost_card = None
        if pub.repost_of_id and pub.repost_of_id in orig_pubs:
            op = orig_pubs[pub.repost_of_id]
            oa = authors.get(op.author_id)
            repost_card = RepostOriginalOut(
                id=op.id,
                content=op.content,
                author_username=oa.username if oa else "inconnu",
                author_full_name=oa.full_name if oa else None,
                author_avatar=oa.avatar_url if oa else None,
                created_at=op.created_at,
            )

        results.append(
            PublicationOut(
                id=pub.id,
                content=pub.content,
                created_at=pub.created_at,
                author_id=pub.author_id,
                author_username=author.username if author else "inconnu",
                author_avatar=author.avatar_url if author else None,
                author_full_name=author.full_name if author else None,
                likes=likes_q.get(pub.id, 0),
                dislikes=0,
                user_reaction=user_reactions.get(pub.id),
                is_supreme_admin=(author.username == "admin") if author else False,
                is_pinned=(pub.id == pinned_pub_id),
                reposts_count=reposts.get(pub.id, 0),
                repost_of_id=pub.repost_of_id,
                repost_original=repost_card,
            )
        )

    if pinned_pub_id:
        pinned_item = next((item for item in results if item.id == pinned_pub_id), None)
        if pinned_item:
            results.remove(pinned_item)
            results.insert(0, pinned_item)

    return results


@router.post("/{id}/react")
def react_publication(
    id: str,
    payload: ReactionUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pub = db.query(models.Publication).filter(models.Publication.id == id).first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publication introuvable")

    reaction = (
        db.query(models.PublicationReaction)
        .filter(
            models.PublicationReaction.publication_id == id,
            models.PublicationReaction.user_id == current_user.id,
        )
        .first()
    )

    # Toggle-off if payload.is_like is None OR user clicks the same reaction again
    if payload.is_like is None or (reaction and reaction.is_like == payload.is_like):
        if reaction:
            db.delete(reaction)
    else:
        if reaction:
            reaction.is_like = payload.is_like
        else:
            new_reaction = models.PublicationReaction(
                id=str(uuid.uuid4()),
                publication_id=id,
                user_id=current_user.id,
                is_like=payload.is_like,
            )
            db.add(new_reaction)

    db.commit()
    return {"success": True}


@router.delete("/{id}")
def delete_publication(
    id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pub = db.query(models.Publication).filter(models.Publication.id == id).first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publication introuvable")

    if pub.author_id != current_user.id and current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Action non autorisée")

    db.query(models.PublicationReaction).filter(models.PublicationReaction.publication_id == id).delete()
    db.delete(pub)
    db.commit()
    return {"success": True}
