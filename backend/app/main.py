from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .db.database import engine, Base, run_auto_migrations
from .routes import auth, users, chats, messages, utils, publications
from .services.websockets import websocket_endpoint, user_websocket_endpoint
import os
import mimetypes

# Register explicit mime types to prevent iOS AVFoundation player failures
mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("audio/wav", ".wav")

# Create database tables and apply safe column migrations
Base.metadata.create_all(bind=engine)
run_auto_migrations()

# Ensure uploads directory exists
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="IQChat API")

cors_origins_env = os.getenv("CORS_ORIGINS", "")
allowed_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allowed_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(chats.router, prefix="/chats", tags=["chats"])
app.include_router(messages.router, prefix="/messages", tags=["messages"])
app.include_router(utils.router, prefix="/utils", tags=["utils"])
app.include_router(publications.router, prefix="/publications", tags=["publications"])

# Serve uploaded files statically
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# WebSocket routes (per-chat and per-user presence/events)
app.add_api_websocket_route("/ws/chat/{chat_id}", websocket_endpoint)
app.add_api_websocket_route("/ws/user", user_websocket_endpoint)


@app.get("/")
def root():
    return {"status": "ok", "message": "IQChat API operational"}
