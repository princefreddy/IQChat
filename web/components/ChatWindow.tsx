"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";
import { MessageSkeleton } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";
import { apiFetch, getChatWsUrl, chatMemoryCache } from "@/lib/api";
import Icon from "./Icon";

export default function ChatWindow({ user, chatId, onChatLeft, onChatsUpdated }: any) {
  const cached = chatMemoryCache[chatId];
  const [chatInfo, setChatInfo] = useState<any>(cached ? cached.chatInfo : null);
  const [messages, setMessages] = useState<any[]>(cached ? cached.messages : []);
  const [loading, setLoading] = useState(!cached);
  const [showAddMember, setShowAddMember] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { showToast } = useToast();

  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [externalDelayedUntil, setExternalDelayedUntil] = useState<string | null>(null);

  // Typing indicator state
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Add member modal state (full directory)
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setHasUnreadBelow(false);
    isNearBottomRef.current = true;
  }, []);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 120;
    isNearBottomRef.current = near;
    if (near) setHasUnreadBelow(false);
  };

  const fetchChat = useCallback(async () => {
    try {
      const res = await apiFetch(`/chats/${chatId}`);
      if (res.ok) {
        const data = await res.json();
        chatMemoryCache[chatId] = { chatInfo: data, messages: data.messages };
        setChatInfo(data);
        setMessages(data.messages);
      }
    } catch {}
    setLoading(false);
  }, [chatId]);

  useEffect(() => {
    if (showAddMember) {
      apiFetch("/users/")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setDirectoryUsers(data))
        .catch(() => {});
    }
  }, [showAddMember]);

  const handleAddMembers = async () => {
    if (selectedUsernames.length === 0) return;
    try {
      const res = await apiFetch(`/chats/${chatId}/add_members`, {
        method: "POST",
        body: JSON.stringify({ member_usernames: selectedUsernames }),
      });
      if (res.ok) {
        setShowAddMember(false);
        setSelectedUsernames([]);
        setMemberSearch("");
        await fetchChat();
        onChatsUpdated?.();
        showToast(`${selectedUsernames.length} membre(s) ajouté(s)`, "success");
      }
    } catch {}
  };

  const handleLeaveChat = async () => {
    const isPrivate = chatInfo?.type === "private";
    if (!window.confirm(isPrivate ? "Voulez-vous masquer cette discussion ?" : "Voulez-vous quitter ce groupe ?")) return;
    try {
      const res = await apiFetch(`/chats/${chatId}/leave`, { method: "DELETE" });
      if (res.ok) {
        delete chatMemoryCache[chatId];
        showToast(isPrivate ? "Discussion masquée" : "Vous avez quitté le groupe", "info");
        onChatLeft?.();
      }
    } catch {}
  };

  const handleDeleteChat = async () => {
    if (!window.confirm("Voulez-vous supprimer définitivement ce groupe pour tous les membres ?")) return;
    try {
      const res = await apiFetch(`/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        delete chatMemoryCache[chatId];
        showToast("Groupe supprimé", "warning");
        onChatLeft?.();
      }
    } catch {}
  };

  const handleKickMember = async (targetUserId: string) => {
    if (!window.confirm("Retirer ce membre du groupe ?")) return;
    try {
      const res = await apiFetch(`/chats/${chatId}/members/${targetUserId}`, { method: "DELETE" });
      if (res.ok) {
        await fetchChat();
        showToast("Membre retiré", "warning");
      }
    } catch {}
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await apiFetch(`/messages/search?chat_id=${chatId}&q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) setSearchResults(await res.json());
    } catch {}
  }, [searchQuery, chatId]);

  useEffect(() => {
    const debounce = setTimeout(handleSearch, 280);
    return () => clearTimeout(debounce);
  }, [handleSearch]);

  useEffect(() => {
    const existing = chatMemoryCache[chatId];
    isNearBottomRef.current = true;
    setHasUnreadBelow(false);
    setReplyingTo(null);
    if (existing) {
      setChatInfo(existing.chatInfo);
      setMessages(existing.messages);
      setLoading(false);
    } else {
      setLoading(true);
      setChatInfo(null);
      setMessages([]);
    }

    fetchChat().then(() => {
      setTimeout(() => scrollToBottom("auto"), 50);
    });

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connectWs = () => {
      if (disposed) return;
      ws = new WebSocket(getChatWsUrl(chatId, user.id));
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => {
        if (disposed) return;
        setIsConnected(false);
        reconnectTimer = setTimeout(connectWs, 3000);
      };
      ws.onerror = () => setIsConnected(false);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.event === "typing") {
            if (data.is_typing) {
              setTypingUser(data.username);
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
            } else {
              setTypingUser(null);
            }
            return;
          }

          if (data.event === "read") {
            const ephMap = new Map<string, any>();
            if (Array.isArray(data.ephemeral_updates)) {
              for (const item of data.ephemeral_updates) {
                ephMap.set(item.id, item);
              }
            }
            setMessages((prev) => {
              const next = prev.map((m) => {
                let updated = m;
                if (m.sender_id === user.id && data.reader_id !== user.id) {
                  updated = { ...updated, is_read: true };
                }
                const eph = ephMap.get(m.id);
                if (eph) {
                  updated = { ...updated, expires_at: eph.expires_at, read_at: eph.read_at };
                }
                return updated;
              });
              if (chatMemoryCache[chatId]) chatMemoryCache[chatId].messages = next;
              return next;
            });
            return;
          }

          if (data.event === "message_deleted") {
            setMessages((prev) => {
              const next = prev.filter((m) => m.id !== data.message_id);
              if (chatMemoryCache[chatId]) chatMemoryCache[chatId].messages = next;
              return next;
            });
            return;
          }

          // Regular new or updated message
          const fromMe = data.sender_id === user.id || !!data.is_own_anonymous;
          if (!fromMe) {
            apiFetch(`/chats/${chatId}/read`, { method: "POST" }).catch(() => {});
          }

          setMessages((prev) => {
            let isNewAppend = false;
            const next = (() => {
              const idx = prev.findIndex((m) => m.id === data.id);
              if (idx !== -1) {
                const copy = [...prev];
                copy[idx] = data;
                return copy;
              }
              if (fromMe) {
                const optIdx = prev.findIndex((m) => m.status === "sending" && m.content === data.content);
                if (optIdx !== -1) {
                  const copy = [...prev];
                  copy[optIdx] = data;
                  return copy;
                }
              }
              isNewAppend = true;
              return [...prev, data];
            })();

            if (chatMemoryCache[chatId]) chatMemoryCache[chatId].messages = next;
            if (isNewAppend) {
              if (fromMe || isNearBottomRef.current) {
                setTimeout(() => scrollToBottom("smooth"), 40);
              } else {
                setHasUnreadBelow(true);
              }
            }
            return next;
          });
          onChatsUpdated?.();
        } catch {}
      };
    };

    connectWs();

    const chatPollInterval = setInterval(() => {
      fetchChat();
    }, 30000);

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
      clearInterval(chatPollInterval);
    };
  }, [chatId, user.id, fetchChat, scrollToBottom, onChatsUpdated]);

  const sendTypingEvent = useCallback(
    (isTyping: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            event: "typing",
            username: user.username || user.full_name,
            is_typing: isTyping,
          })
        );
      }
    },
    [user]
  );

  const handleSend = async (msgData: any) => {
    sendTypingEvent(false);
    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      id: tempId,
      chat_id: chatId,
      sender_id: user.id,
      sender_username: msgData.is_anonymous ? null : user.username,
      sender_avatar: msgData.is_anonymous ? null : user.avatar_url,
      content: msgData.content || "",
      file_url: msgData.file_url || null,
      file_type: msgData.file_type || null,
      file_name: msgData.file_name || null,
      created_at: new Date().toISOString(),
      type: msgData.type || "normal",
      visible_at: msgData.visible_at || null,
      expires_at: null,
      reply_to_id: msgData.reply_to_id || null,
      reply_to_sender: msgData.reply_to_sender || null,
      reply_to_content: msgData.reply_to_content || null,
      is_anonymous: !!msgData.is_anonymous,
      is_own_anonymous: !!msgData.is_anonymous,
      reactions: {},
      status: "sending",
    };

    setMessages((prev) => {
      const next = [...prev, tempMessage];
      if (chatMemoryCache[chatId]) chatMemoryCache[chatId].messages = next;
      return next;
    });
    setReplyingTo(null);
    setTimeout(() => scrollToBottom("smooth"), 30);

    try {
      const res = await apiFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify({ chat_id: chatId, ...msgData }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || "Échec de l'envoi", "error");
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "error" } : m)));
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "error" } : m)));
    }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    try {
      const res = await apiFetch(`/messages/${msgId}/reaction`, {
        method: "PUT",
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, reaction: updated.reaction, reactions: updated.reactions } : m)));
      }
    } catch {}
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm("Supprimer ce message pour tout le monde ?")) return;
    try {
      const res = await apiFetch(`/messages/${msgId}`, { method: "DELETE" });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        showToast("Message supprimé", "info");
      }
    } catch {}
  };

  const handleAccept = async () => {
    try {
      const res = await apiFetch(`/chats/${chatId}/accept`, { method: "PATCH" });
      if (res.ok) {
        await fetchChat();
        onChatsUpdated?.();
        showToast("Invitation acceptée", "success");
      }
    } catch {}
  };

  const handleDecline = async () => {
    if (!window.confirm("Décliner cette invitation ?")) return;
    try {
      const res = await apiFetch(`/chats/${chatId}/decline`, { method: "POST" });
      if (res.ok) {
        delete chatMemoryCache[chatId];
        showToast("Invitation déclinée", "info");
        onChatLeft?.();
      }
    } catch {}
  };

  const scheduleForWakeUp = (wakeTimeStr: string) => {
    const [hh, mm] = (wakeTimeStr || "08:00").split(":").map((x) => parseInt(x, 10));
    const now = new Date();
    const target = new Date(now);
    target.setHours(isNaN(hh) ? 8 : hh, isNaN(mm) ? 0 : mm, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    setExternalDelayedUntil(target.toISOString());
    showToast(`Envoi programmé pour ${wakeTimeStr}`, "info");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  if (loading) return <MessageSkeleton />;
  if (!chatInfo) return <div style={{ padding: "24px", color: "var(--text-secondary)" }}>Conversation introuvable.</div>;

  const isPrivate = chatInfo.type === "private";
  const otherMember = isPrivate ? chatInfo.members?.find((m: any) => m.user_id !== user.id) : null;
  const amIAdmin = chatInfo.members?.find((m: any) => m.user_id === user.id)?.role === "admin";
  const isPending = chatInfo.status === "pending";

  const availableDirectoryUsers = directoryUsers.filter((u) => {
    if (u.is_banned) return false;
    if (chatInfo.members?.some((m: any) => m.user_id === u.id)) return false;
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Header */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--border-glass)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {isPrivate && otherMember?.avatar_url ? (
          <div style={{ position: "relative", cursor: "pointer" }} onClick={() => setViewImage(otherMember.avatar_url)}>
            <img src={otherMember.avatar_url} alt="Avatar" style={{ width: "40px", height: "40px", borderRadius: "20px", objectFit: "cover" }} />
            {otherMember.is_online && (
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: "11px",
                  height: "11px",
                  backgroundColor: "#4ade80",
                  borderRadius: "6px",
                  border: "2px solid var(--bg-primary)",
                }}
              />
            )}
          </div>
        ) : (
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "20px",
              background: "var(--accent-gold-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              color: "#0A1128",
            }}
          >
            {isPrivate
              ? (otherMember ? otherMember.full_name || otherMember.username : "C").charAt(0).toUpperCase()
              : (chatInfo.name || "G").charAt(0).toUpperCase()}
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <h3 style={{ margin: 0, color: "var(--accent-gold)", fontSize: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isPrivate ? (otherMember ? otherMember.full_name || otherMember.username : "Discussion") : chatInfo.name || "Groupe"}
            </h3>
            {!isPrivate && amIAdmin && (
              <span title="Administrateur du groupe" style={{ display: "inline-flex" }}>
                <Icon name="award" size={14} color="var(--accent-gold)" />
              </span>
            )}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px", display: "flex", alignItems: "center", gap: "8px" }}>
            {isPrivate ? (
              <>
                <span>{otherMember?.is_online ? "En ligne" : "Hors ligne"}</span>
                {otherMember?.bio && (
                  <span style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>• {otherMember.bio}</span>
                )}
              </>
            ) : (
              <span>{chatInfo.members?.length || 0} participants</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button
            type="button"
            className={`icon-btn ${showSearch ? "active" : ""}`}
            onClick={() => setShowSearch((v) => !v)}
            title="Rechercher dans la conversation (Ctrl+F)"
          >
            <Icon name="search" size={16} />
          </button>

          {!isPrivate && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowAddMember(true)}
              title="Membres du groupe"
              style={{ width: "auto", padding: "0 10px", gap: "6px", fontSize: "12px" }}
            >
              <Icon name="users" size={15} color="var(--accent-gold)" />
              {amIAdmin && <span>Membres</span>}
            </button>
          )}

          <button
            type="button"
            className="icon-btn"
            onClick={handleLeaveChat}
            title={isPrivate ? "Masquer la discussion" : "Quitter le groupe"}
          >
            <Icon name="log-out" size={16} />
          </button>

          {!isPrivate && amIAdmin && (
            <button type="button" className="icon-btn danger" onClick={handleDeleteChat} title="Supprimer le groupe pour tous">
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Offline Banner */}
      {!isConnected && (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.14)",
            borderBottom: "1px solid rgba(239, 68, 68, 0.3)",
            padding: "7px 20px",
            fontSize: "12px",
            color: "#f87171",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Icon name="alert-triangle" size={14} color="#f87171" />
          <span>Connexion temps réel interrompue. Reconnexion automatique en cours...</span>
        </div>
      )}

      {/* Quiet Hours Banner (Slow Communication) */}
      {isPrivate && otherMember?.is_in_quiet_hours && !isPending && (
        <div
          style={{
            backgroundColor: "rgba(197, 160, 59, 0.09)",
            borderBottom: "1px solid rgba(197, 160, 59, 0.25)",
            padding: "8px 20px",
            fontSize: "12px",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="moon" size={15} color="var(--accent-gold)" />
            <span>
              <strong>{otherMember.full_name || otherMember.username}</strong> est en mode quiétude jusqu&apos;à{" "}
              <strong>{otherMember.quiet_hours_end || "08:00"}</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => scheduleForWakeUp(otherMember.quiet_hours_end || "08:00")}
            className="btn-alt"
            style={{ padding: "4px 10px", fontSize: "11px", borderColor: "var(--accent-gold)", color: "var(--accent-gold)" }}
          >
            Programmer pour {otherMember.quiet_hours_end || "08:00"}
          </button>
        </div>
      )}

      {/* In-Chat Search Bar */}
      {showSearch && (
        <div
          className="animate-slide-up"
          style={{
            padding: "8px 20px",
            borderBottom: "1px solid var(--border-glass)",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <Icon name="search" size={15} color="var(--text-secondary)" />
          <input
            className="input-royal"
            placeholder="Rechercher dans cette conversation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            style={{ flex: 1, padding: "7px 12px", fontSize: "13px" }}
          />
          {searchResults.length > 0 && (
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              {searchResults.length} résultat(s)
            </span>
          )}
          <button
            type="button"
            className="icon-btn"
            style={{ width: "30px", height: "30px", border: "none" }}
            onClick={() => {
              setShowSearch(false);
              setSearchQuery("");
              setSearchResults([]);
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      {showSearch && searchResults.length > 0 && (
        <div style={{ maxHeight: "190px", overflowY: "auto", borderBottom: "1px solid var(--border-glass)", background: "rgba(5,9,22,0.7)" }}>
          {searchResults.map((r) => (
            <div
              key={r.id}
              style={{ padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
              onClick={() => {
                const el = document.getElementById(`msg-${r.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.style.background = "rgba(212, 175, 55, 0.16)";
                  setTimeout(() => {
                    el.style.background = "";
                  }, 2000);
                }
              }}
            >
              <div style={{ fontSize: "11px", color: "var(--accent-gold)" }}>
                {r.sender_username || "Membre"} • {new Date(r.created_at).toLocaleString()}
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Group Members Modal */}
      {showAddMember && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,9,22,0.8)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => setShowAddMember(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0E1834",
              padding: "22px",
              borderRadius: "16px",
              border: "1px solid rgba(197,160,59,0.3)",
              width: "100%",
              maxWidth: "380px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, color: "var(--accent-gold)", fontSize: "16px" }}>Membres du groupe</h3>
              <button type="button" className="icon-btn" onClick={() => setShowAddMember(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "160px", overflowY: "auto" }}>
              {chatInfo.members?.map((m: any) => (
                <div
                  key={m.user_id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "var(--bg-glass)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {m.avatar_url && <img src={m.avatar_url} alt="" style={{ width: "24px", height: "24px", borderRadius: "12px" }} />}
                    <span style={{ color: "white", fontSize: "13px", fontWeight: 500 }}>{m.full_name || m.username}</span>
                    {m.role === "admin" && <Icon name="award" size={13} color="var(--accent-gold)" />}
                  </div>
                  {!isPrivate && amIAdmin && m.user_id !== user.id && (
                    <button
                      type="button"
                      onClick={() => handleKickMember(m.user_id)}
                      style={{ color: "#f87171", background: "transparent", border: "none", cursor: "pointer", fontSize: "12px" }}
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ))}
            </div>

            {amIAdmin && (
              <>
                <div style={{ borderTop: "1px solid var(--border-glass)", paddingTop: "10px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-gold)", marginBottom: "8px" }}>Ajouter depuis l&apos;annuaire</div>
                  <input
                    className="input-royal"
                    placeholder="Rechercher un utilisateur..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    style={{ padding: "8px 10px", fontSize: "13px", marginBottom: "8px" }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                    {availableDirectoryUsers.length === 0 ? (
                      <div style={{ color: "var(--text-secondary)", fontSize: "12px", padding: "6px 0" }}>Aucun utilisateur disponible.</div>
                    ) : (
                      availableDirectoryUsers.map((c) => {
                        const isSelected = selectedUsernames.includes(c.username);
                        return (
                          <div
                            key={c.id}
                            onClick={() =>
                              setSelectedUsernames((prev) =>
                                isSelected ? prev.filter((u) => u !== c.username) : [...prev, c.username]
                              )
                            }
                            style={{
                              padding: "8px 10px",
                              borderRadius: "8px",
                              background: isSelected ? "rgba(197,160,59,0.18)" : "var(--bg-glass)",
                              border: `1px solid ${isSelected ? "var(--accent-gold)" : "transparent"}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <img src={c.avatar_url} alt="" style={{ width: "24px", height: "24px", borderRadius: "12px" }} />
                              <div>
                                <div style={{ color: "white", fontSize: "13px" }}>{c.full_name}</div>
                                <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>@{c.username}</div>
                              </div>
                            </div>
                            {isSelected && <Icon name="check" size={15} color="var(--accent-gold)" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" className="btn-alt" style={{ flex: 1 }} onClick={() => setShowAddMember(false)}>
                    Fermer
                  </button>
                  <button
                    type="button"
                    className="btn-royal"
                    style={{ flex: 1 }}
                    disabled={selectedUsernames.length === 0}
                    onClick={handleAddMembers}
                  >
                    Ajouter ({selectedUsernames.length})
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ flex: 1, padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column" }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-secondary)",
              margin: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "28px",
                background: "rgba(197, 160, 59, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="message-square" size={26} color="var(--accent-gold)" />
            </div>
            <div style={{ fontSize: "14px" }}>Démarrez la conversation en toute sérénité.</div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_id === user.id || !!msg.is_own_anonymous}
              currentUserId={user.id}
              userSettings={user}
              onReaction={handleReaction}
              onReply={() => setReplyingTo(msg)}
              onDelete={handleDeleteMessage}
              onViewImage={(url: string) => setViewImage(url)}
              onUnlockRefresh={fetchChat}
            />
          ))
        )}
        {typingUser && <TypingIndicator username={typingUser} />}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll-to-bottom button */}
      {hasUnreadBelow && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          style={{
            position: "absolute",
            bottom: "86px",
            right: "24px",
            background: "var(--accent-gold-gradient)",
            color: "#0A1128",
            border: "none",
            borderRadius: "20px",
            padding: "8px 14px",
            fontWeight: 600,
            fontSize: "12px",
            cursor: "pointer",
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            zIndex: 30,
          }}
        >
          <Icon name="arrow-down" size={14} color="#0A1128" />
          <span>Nouveaux messages</span>
        </button>
      )}

      {/* Pending Invitation Bar OR Message Composer */}
      {isPending ? (
        <div style={{ padding: "20px 24px", textAlign: "center", borderTop: "1px solid var(--border-glass)", background: "var(--bg-glass)" }}>
          {amIAdmin ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "14px" }}>
              <Icon name="clock" size={16} color="var(--accent-gold)" />
              <span>Invitation envoyée. En attente de la réponse de votre interlocuteur.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent-gold)", fontWeight: 500 }}>
                <Icon name="user-plus" size={17} color="var(--accent-gold)" />
                <span>Cet utilisateur souhaite échanger avec vous.</span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleDecline}
                  className="btn-alt"
                  style={{ padding: "9px 18px", color: "#f87171", borderColor: "rgba(248,113,113,0.4)" }}
                >
                  Décliner
                </button>
                <button type="button" onClick={handleAccept} className="btn-royal" style={{ padding: "9px 22px" }}>
                  Accepter la discussion
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <MessageInput
          user={user}
          onSend={handleSend}
          onTyping={sendTypingEvent}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          externalDelayedUntil={externalDelayedUntil}
          onClearExternalDelay={() => setExternalDelayedUntil(null)}
        />
      )}

      {/* Full Screen Image Lightbox */}
      {viewImage && (
        <div
          onClick={() => setViewImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(5, 9, 22, 0.9)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
            padding: "24px",
          }}
        >
          <button
            type="button"
            className="icon-btn"
            onClick={() => setViewImage(null)}
            style={{ position: "absolute", top: "20px", right: "20px", background: "rgba(255,255,255,0.1)" }}
          >
            <Icon name="x" size={20} color="#FFF" />
          </button>
          <img
            src={viewImage}
            alt="Aperçu"
            style={{
              maxWidth: "92%",
              maxHeight: "90%",
              objectFit: "contain",
              borderRadius: "10px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      )}
    </div>
  );
}
