from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
import uuid
import datetime

from ..db.database import get_db
from .. import models
from ..services.auth_utils import get_current_user

router = APIRouter()

class PublicationCreate(BaseModel):
    content: str
    repost_of_id: str | None = None
    
class ReactionUpdate(BaseModel):
    is_like: bool
    
class PublicationOut(BaseModel):
    id: str
    content: str
    created_at: datetime.datetime
    author_id: str
    author_username: str
    author_avatar: str | None
    author_full_name: str | None
    likes: int
    dislikes: int
    user_reaction: bool | None
    is_supreme_admin: bool = False
    is_pinned: bool = False
    reposts_count: int = 0
    repost_of_id: str | None = None

BAD_WORDS = ["porn", "sex", "nude", "salope", "pd", "pute", "connard", "fuck", "bitch", "shit", "merde", "putain"]

@router.get("/latest_time")
def get_latest_time(db: Session = Depends(get_db)):
    latest = db.query(models.Publication).order_by(models.Publication.created_at.desc()).first()
    if latest:
        return {"latest_time": latest.created_at.isoformat()}
    return {"latest_time": None}

@router.post("/")
def create_publication(payload: PublicationCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Profanity Filter
    text_lower = payload.content.lower()
    if any(bad_word in text_lower for bad_word in BAD_WORDS):
        raise HTTPException(status_code=400, detail="Contenu inapproprié détecté.")
    
    if len(payload.content) > 500:
        raise HTTPException(status_code=400, detail="La publication ne peut pas dépasser 500 caractères.")
    
    pub = models.Publication(
        id=str(uuid.uuid4()),
        author_id=current_user.id,
        content=payload.content,
        repost_of_id=payload.repost_of_id
    )
    db.add(pub)
    db.commit()
    return {"success": True, "id": pub.id}

@router.get("/")
def get_publications(skip: int = 0, limit: int = 30, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Optimized publications feed with batch loading and pagination."""
    pubs = db.query(models.Publication).order_by(models.Publication.created_at.desc()).offset(skip).limit(limit).all()
    
    if not pubs:
        return []
    
    pub_ids = [p.id for p in pubs]
    author_ids = {p.author_id for p in pubs}
    
    # Batch load all authors
    authors = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(author_ids)).all()}
    
    # Batch load all reaction counts
    likes_q = dict(
        db.query(models.PublicationReaction.publication_id, func.count(models.PublicationReaction.id))
        .filter(models.PublicationReaction.publication_id.in_(pub_ids), models.PublicationReaction.is_like == True)
        .group_by(models.PublicationReaction.publication_id)
        .all()
    )
    dislikes_q = dict(
        db.query(models.PublicationReaction.publication_id, func.count(models.PublicationReaction.id))
        .filter(models.PublicationReaction.publication_id.in_(pub_ids), models.PublicationReaction.is_like == False)
        .group_by(models.PublicationReaction.publication_id)
        .all()
    )
    
    # Batch load current user's reactions
    user_reactions = {}
    if current_user:
        for r in db.query(models.PublicationReaction).filter(
            models.PublicationReaction.publication_id.in_(pub_ids),
            models.PublicationReaction.user_id == current_user.id
        ).all():
            user_reactions[r.publication_id] = r.is_like
    
    # Batch load repost counts
    reposts = dict(
        db.query(models.Publication.repost_of_id, func.count(models.Publication.id))
        .filter(models.Publication.repost_of_id.in_(pub_ids))
        .group_by(models.Publication.repost_of_id)
        .all()
    )
    
    # Identify admin's pinned post
    pinned_pub_id = None
    for pub in pubs:
        author = authors.get(pub.author_id)
        if author and author.username == 'admin':
            pinned_pub_id = pub.id
            break
    
    results = []
    for pub in pubs:
        author = authors.get(pub.author_id)
        results.append(PublicationOut(
            id=pub.id,
            content=pub.content,
            created_at=pub.created_at,
            author_id=pub.author_id,
            author_username=author.username if author else "Unknown",
            author_avatar=author.avatar_url if author else None,
            author_full_name=author.full_name if author else None,
            likes=likes_q.get(pub.id, 0),
            dislikes=dislikes_q.get(pub.id, 0),
            user_reaction=user_reactions.get(pub.id),
            is_supreme_admin=(author.username == 'admin') if author else False,
            is_pinned=(pub.id == pinned_pub_id),
            reposts_count=reposts.get(pub.id, 0),
            repost_of_id=pub.repost_of_id
        ))
        
    # Reorder to put the pinned post at the very top
    if pinned_pub_id:
        pinned_item = next((item for item in results if item.id == pinned_pub_id), None)
        if pinned_item:
            results.remove(pinned_item)
            results.insert(0, pinned_item)
            
    return results

@router.post("/{id}/react")
def react_publication(id: str, payload: ReactionUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    pub = db.query(models.Publication).filter(models.Publication.id == id).first()
    if not pub: raise HTTPException(status_code=404, detail="Publication not found")
        
    reaction = db.query(models.PublicationReaction).filter(models.PublicationReaction.publication_id == id, models.PublicationReaction.user_id == current_user.id).first()
    
    if payload.is_like is None:
        if reaction: db.delete(reaction)
    else:
        if reaction: reaction.is_like = payload.is_like
        else:
            new_reaction = models.PublicationReaction(
                id=str(uuid.uuid4()), publication_id=id, user_id=current_user.id, is_like=payload.is_like
            )
            db.add(new_reaction)
            
    db.commit()
    return {"success": True}

@router.delete("/{id}")
def delete_publication(id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    pub = db.query(models.Publication).filter(models.Publication.id == id).first()
    if not pub: raise HTTPException(status_code=404, detail="Publication not found")
    
    if pub.author_id != current_user.id and current_user.username != 'admin':
        raise HTTPException(status_code=403, detail="Not authorized to delete this publication")
        
    db.query(models.PublicationReaction).filter(models.PublicationReaction.publication_id == id).delete()
    db.delete(pub)
    db.commit()
    return {"success": True}
