from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List, Iterable, Optional
from datetime import datetime
import json

from .auth_utils import resolve_ws_user_id


class ConnectionManager:
    def __init__(self):
        # chat_id -> list of (WebSocket, user_id) tuples
        self.active_connections: Dict[str, List[tuple]] = {}
        # user_id -> list of global user WebSockets (/ws/user)
        self.user_connections: Dict[str, List[WebSocket]] = {}
        # user_id -> total count of active sockets (chat + global)
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

        if chat_id in self.typing_users and user_id:
            self.typing_users[chat_id].discard(user_id)

    async def connect_user(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.user_connections.setdefault(user_id, []).append(websocket)
        self.active_users[user_id] = self.active_users.get(user_id, 0) + 1

    def disconnect_user(self, websocket: WebSocket, user_id: str):
        if user_id in self.user_connections:
            self.user_connections[user_id] = [
                ws for ws in self.user_connections[user_id] if ws != websocket
            ]
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

        if user_id in self.active_users:
            self.active_users[user_id] -= 1
            if self.active_users[user_id] <= 0:
                del self.active_users[user_id]

    async def notify_users(self, user_ids: Iterable[str], event: dict):
        """Push a real-time notification event to connected users' global sockets."""
        for uid in set(user_ids):
            if not uid or uid not in self.user_connections:
                continue
            dead = []
            for ws in self.user_connections[uid]:
                try:
                    await ws.send_json(event)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                if uid in self.user_connections and ws in self.user_connections[uid]:
                    self.user_connections[uid].remove(ws)

    async def broadcast_to_chat(self, chat_id: str, message: dict):
        """Broadcast a generic event/message to all connections in a chat."""
        if chat_id in self.active_connections:
            dead_connections = []
            for ws, uid in self.active_connections[chat_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead_connections.append((ws, uid))
            for dead in dead_connections:
                if chat_id in self.active_connections and dead in self.active_connections[chat_id]:
                    self.active_connections[chat_id].remove(dead)

    async def broadcast_message_to_chat(
        self,
        chat_id: str,
        base_msg: dict,
        real_sender_id: Optional[str],
        visible_at_dt: Optional[datetime] = None,
    ):
        """
        Broadcast a message while:
        1. Preserving sender_id ONLY for the author when is_anonymous=True (so their UI recognizes isOwn).
        2. Masking delayed message content/attachments for recipients when visible_at is in the future.
        """
        if chat_id not in self.active_connections:
            return

        now = datetime.utcnow()
        is_locked_for_others = bool(visible_at_dt and visible_at_dt.replace(tzinfo=None) > now)
        dead_connections = []

        for ws, uid in self.active_connections[chat_id]:
            payload = dict(base_msg)
            is_author = bool(real_sender_id and uid == real_sender_id)

            if payload.get("is_anonymous"):
                if is_author:
                    payload["sender_id"] = real_sender_id
                    payload["is_own_anonymous"] = True
                else:
                    payload["sender_id"] = None
                    payload["sender_username"] = None
                    payload["sender_avatar"] = None
                    payload["is_own_anonymous"] = False

            if is_locked_for_others and not is_author:
                payload["content"] = ""
                payload["file_url"] = None
                payload["file_name"] = None

            try:
                await ws.send_json(payload)
            except Exception:
                dead_connections.append((ws, uid))

        for dead in dead_connections:
            if chat_id in self.active_connections and dead in self.active_connections[chat_id]:
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
                if uid != user_id:
                    try:
                        await ws.send_json(event)
                    except Exception:
                        pass

    async def broadcast_read_receipt(self, chat_id: str, reader_id: str, ephemeral_updates: Optional[List[dict]] = None):
        """Notify all connections in a chat that a user has read messages (plus any started ephemeral timers)."""
        event = {
            "event": "read",
            "user_id": reader_id,
            "ephemeral_updates": ephemeral_updates or [],
        }
        if chat_id in self.active_connections:
            for ws, uid in self.active_connections[chat_id]:
                if uid != reader_id or ephemeral_updates:
                    try:
                        await ws.send_json(event)
                    except Exception:
                        pass

    def is_user_online(self, user_id: str) -> bool:
        return user_id in self.active_users and self.active_users[user_id] > 0


manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket, chat_id: str, user_id: str = None, token: str = None):
    resolved_uid = resolve_ws_user_id(token, user_id)
    await manager.connect(websocket, chat_id, resolved_uid)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                event_type = data.get("event")

                if event_type == "typing":
                    username = data.get("username", "")
                    is_typing = data.get("is_typing", False)
                    await manager.broadcast_typing(chat_id, resolved_uid or "", username, is_typing)

                elif event_type == "read":
                    await manager.broadcast_read_receipt(chat_id, resolved_uid or "")

            except (json.JSONDecodeError, KeyError):
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket, chat_id, resolved_uid)
        if resolved_uid:
            await manager.broadcast_typing(chat_id, resolved_uid, "", False)


async def user_websocket_endpoint(websocket: WebSocket, user_id: str = None, token: str = None):
    resolved_uid = resolve_ws_user_id(token, user_id)
    if not resolved_uid:
        await websocket.close(code=1008)
        return
    await manager.connect_user(websocket, resolved_uid)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_user(websocket, resolved_uid)
