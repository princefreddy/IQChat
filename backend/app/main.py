from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .db.database import engine, Base
from .routes import auth, users, chats, messages, utils, publications
from .services.websockets import websocket_endpoint
import os

# Create database tables
Base.metadata.create_all(bind=engine)

# Ensure uploads directory exists
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="IQChat API - MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.0.14:3000",
        "http://192.168.0.14:8000",
        "*",  # Keep wildcard for mobile dev — restrict in production
    ],
    allow_credentials=True,
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

# Root WebSocket route for chats
app.add_api_websocket_route("/ws/chat/{chat_id}", websocket_endpoint)

@app.get("/")
def root():
    return {"status": "ok", "message": "Welcome to IQChat API for the MVP!"}
