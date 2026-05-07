from fastapi import APIRouter, HTTPException, Query
from bs4 import BeautifulSoup
import requests
from pydantic import BaseModel

router = APIRouter()

class LinkPreviewResponse(BaseModel):
    title: str | None = None
    description: str | None = None
    image: str | None = None
    url: str

@router.get("/link-preview", response_model=LinkPreviewResponse)
def get_link_preview(url: str = Query(..., description="The URL to scrape")):
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    try:
        # Use a real user-agent to bypass basic bot-blocking
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        res = requests.get(url, headers=headers, timeout=5)
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Scrape OpenGraph Metadata
        title = soup.find("meta", property="og:title")
        title_content = title["content"] if title else (soup.title.string if soup.title else None)
        
        desc = soup.find("meta", property="og:description")
        desc_content = desc["content"] if desc else None
        if not desc_content:
            meta_desc = soup.find("meta", attrs={"name": "description"})
            desc_content = meta_desc["content"] if meta_desc else None
            
        img = soup.find("meta", property="og:image")
        img_content = img["content"] if img else None
        
        # Normalize relative image URLs
        if img_content and img_content.startswith("/"):
            from urllib.parse import urljoin
            img_content = urljoin(url, img_content)

        return LinkPreviewResponse(
            title=title_content,
            description=desc_content,
            image=img_content,
            url=url
        )
    except Exception as e:
        # Fallback empty response gracefully instead of 500 error for bad links
        return LinkPreviewResponse(url=url)
