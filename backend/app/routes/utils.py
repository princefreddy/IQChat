from fastapi import APIRouter, Query
from bs4 import BeautifulSoup
from pydantic import BaseModel
from urllib.parse import urlparse, urljoin
import ipaddress
import socket
import requests

router = APIRouter()


class LinkPreviewResponse(BaseModel):
    title: str | None = None
    description: str | None = None
    image: str | None = None
    url: str


def _is_safe_public_url(target_url: str) -> bool:
    """Reject internal/loopback/link-local/private IPs to prevent SSRF."""
    try:
        parsed = urlparse(target_url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        if hostname.lower() in ("localhost", "metadata.google.internal"):
            return False

        addr_infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
        for info in addr_infos:
            ip_str = info[4][0]
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return False
        return True
    except Exception:
        return False


@router.get("/link-preview", response_model=LinkPreviewResponse)
def get_link_preview(url: str = Query(..., description="The URL to scrape")):
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    if not _is_safe_public_url(url):
        return LinkPreviewResponse(url=url)

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; IQChatBot/1.0)"
        }
        res = requests.get(url, headers=headers, timeout=4, stream=True, allow_redirects=True)
        # Validate final redirected URL as well
        if not _is_safe_public_url(res.url):
            res.close()
            return LinkPreviewResponse(url=url)

        res.raise_for_status()
        content_type = res.headers.get("Content-Type", "")
        if "text/html" not in content_type.lower():
            res.close()
            return LinkPreviewResponse(url=url)

        # Read at most 256 KB
        chunks = []
        downloaded = 0
        for chunk in res.iter_content(chunk_size=16384):
            chunks.append(chunk)
            downloaded += len(chunk)
            if downloaded >= 262144:
                break
        res.close()
        html_bytes = b"".join(chunks)

        soup = BeautifulSoup(html_bytes, "html.parser")

        title = soup.find("meta", property="og:title")
        title_content = title.get("content") if title else (soup.title.string.strip() if soup.title and soup.title.string else None)

        desc = soup.find("meta", property="og:description")
        desc_content = desc.get("content") if desc else None
        if not desc_content:
            meta_desc = soup.find("meta", attrs={"name": "description"})
            desc_content = meta_desc.get("content") if meta_desc else None

        img = soup.find("meta", property="og:image")
        img_content = img.get("content") if img else None

        if img_content and img_content.startswith("/"):
            img_content = urljoin(res.url, img_content)

        return LinkPreviewResponse(
            title=title_content,
            description=desc_content,
            image=img_content,
            url=url,
        )
    except Exception:
        return LinkPreviewResponse(url=url)
