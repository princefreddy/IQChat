from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        # chat_id -> list of (WebSocket, user_id) tuples
        self.active_connections: Dict[str, List[tuple]] = {}
        # user_id -> count of connections
        self.active_users: Dict[str, int] = {}
        # chat_id -> set of user_ids currently typing
        self.typing_users: Dict[str, set] = {}

    async def connect(self, websocket: WebSocket, chat_id: str, user_id: str = None):
        await websocket.accept()
        if chat_id not in self.active_connections:
            self.active_connections[chat_id] = []
        self.active_connections[chat_id].append((websocket, user_id))
        
        if user_id:
            self.active_users[user_id] = self.active_users.get(user_id, 0) + 1

    def disconnect(self, websocket: WebSocket, chat_id: str, user_id: str = None):
        if chat_id in self.active_connections:
            self.active_connections[chat_id] = [
                (ws, uid) for ws, uid in self.active_connections[chat_id] 
                if ws != websocket
            ]
            if not self.active_connections[chat_id]:
                del self.active_connections[chat_id]
                
        if user_id and user_id in self.active_users:
            self.active_users[user_id] -= 1
            if self.active_users[user_id] <= 0:
                del self.active_users[user_id]
        
        # Clean typing status
        if chat_id in self.typing_users and user_id:
            self.typing_users[chat_id].discard(user_id)

    async def broadcast_to_chat(self, chat_id: str, message: dict):
        """Broadcast a message/event to all connections in a chat."""
        if chat_id in self.active_connections:
            dead_connections = []
            for ws, uid in self.active_connections[chat_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead_connections.append((ws, uid))
            # Clean up dead connections
            for dead in dead_connections:
                self.active_connections[chat_id].remove(dead)

    async def broadcast_typing(self, chat_id: str, user_id: str, username: str, is_typing: bool):
        """Broadcast typing indicator to all other users in the chat."""
        if is_typing:
            self.typing_users.setdefault(chat_id, set()).add(user_id)
        else:
            if chat_id in self.typing_users:
                self.typing_users[chat_id].discard(user_id)
        
        event = {
            "event": "typing",
            "user_id": user_id,
            "username": username,
            "is_typing": is_typing,
        }
        
        if chat_id in self.active_connections:
            for ws, uid in self.active_connections[chat_id]:
                if uid != user_id:  # Don't send to the typer
                    try:
                        await ws.send_json(event)
                    except Exception:
                        pass

    async def broadcast_read_receipt(self, chat_id: str, reader_id: str):
        """Notify all connections that a user has read messages."""
        event = {
            "event": "read",
            "user_id": reader_id,
        }
        if chat_id in self.active_connections:
            for ws, uid in self.active_connections[chat_id]:
                if uid != reader_id:
                    try:
                        await ws.send_json(event)
                    except Exception:
                        pass

    def is_user_online(self, user_id: str) -> bool:
        return user_id in self.active_users and self.active_users[user_id] > 0

manager = ConnectionManager()

async def websocket_endpoint(websocket: WebSocket, chat_id: str, user_id: str = None):
    await manager.connect(websocket, chat_id, user_id)
    try:
        while True:
            raw = await websocket.receive_text()
            # Handle structured events from clients
            try:
                data = json.loads(raw)
                event_type = data.get("event")
                
                if event_type == "typing":
                    username = data.get("username", "")
                    is_typing = data.get("is_typing", False)
                    await manager.broadcast_typing(chat_id, user_id or "", username, is_typing)
                    
                elif event_type == "read":
                    await manager.broadcast_read_receipt(chat_id, user_id or "")
                    
            except (json.JSONDecodeError, KeyError):
                pass  # Ignore malformed events
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, chat_id, user_id)
        # Broadcast that user stopped typing if they were
        if user_id:
            await manager.broadcast_typing(chat_id, user_id, "", False)
