"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChatList from "@/components/ChatList";
import ChatWindow from "@/components/ChatWindow";
import PublicationsFeed from "@/components/PublicationsFeed";
import ToastProvider from "@/components/ToastProvider";
import Icon from "@/components/Icon";
import { getAuthData, apiFetch, getUserWsUrl } from "@/lib/api";

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"chats" | "feed" | "announcement">("chats");
  const [hasNewFeed, setHasNewFeed] = useState(false);
  const [chatsRefreshKey, setChatsRefreshKey] = useState(0);

  useEffect(() => {
    const auth = getAuthData();
    if (!auth?.token) {
      router.push("/");
    } else {
      setUser(auth.user);
      // Refresh user profile/settings from server silently
      apiFetch("/users/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((freshUser) => {
          if (freshUser) setUser(freshUser);
        })
        .catch(() => {});
    }
  }, [router]);

  // Global presence & instant sidebar updates WebSocket
  useEffect(() => {
    if (!user?.id) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(getUserWsUrl(user.id));
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.event === "chats_updated" || data.event === "presence") {
            setChatsRefreshKey((k) => k + 1);
          }
        } catch {}
      };
      ws.onclose = () => {
        if (!disposed) reconnectTimer = setTimeout(connect, 4000);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const checkFeed = async () => {
      try {
        const res = await apiFetch("/publications/latest_time");
        if (!res.ok) return;
        const data = await res.json();
        if (data.latest_time) {
          const lastSeen =
            localStorage.getItem("homichat_last_seen_feed") ||
            localStorage.getItem("iqchat_last_seen_feed");
          if (!lastSeen || new Date(data.latest_time).getTime() > new Date(lastSeen).getTime()) {
            if (activeView !== "feed") setHasNewFeed(true);
          }
        }
      } catch {}
    };
    checkFeed();
    const interval = setInterval(checkFeed, 30000);
    return () => clearInterval(interval);
  }, [user, activeView]);

  const handleSwitchToFeed = () => {
    setActiveView("feed");
    setHasNewFeed(false);
    localStorage.setItem("homichat_last_seen_feed", new Date().toISOString());
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeView === "feed") {
        setActiveView("chats");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeView]);

  if (!user) return null;

  const isShowSidebar = !activeChatId && activeView === "chats";
  const fontSizeClass = `font-${user.font_size || "normal"}`;

  return (
    <ToastProvider>
      <div className={`app-container ${fontSizeClass} ${isShowSidebar ? "show-sidebar" : "show-chat"}`}>
        <div className="sidebar glass-panel animate-slide-up" style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              padding: "12px",
              gap: "6px",
              borderBottom: "1px solid var(--border-glass)",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveView("chats")}
              style={{
                flex: 1,
                minWidth: "90px",
                padding: "8px 10px",
                background: activeView === "chats" ? "var(--accent-royal)" : "transparent",
                color: "#FFF",
                border: activeView === "chats" ? "1px solid transparent" : "1px solid var(--border-glass)",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Icon name="message-square" size={14} />
              <span>Discussions</span>
            </button>

            <button
              type="button"
              onClick={handleSwitchToFeed}
              style={{
                flex: 1,
                minWidth: "90px",
                position: "relative",
                padding: "8px 10px",
                background: activeView === "feed" ? "var(--accent-gold)" : "transparent",
                color: activeView === "feed" ? "#0A1128" : "#FFF",
                border: activeView === "feed" ? "1px solid var(--accent-gold)" : "1px solid var(--border-glass)",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Icon name="globe" size={14} color={activeView === "feed" ? "#0A1128" : "currentColor"} />
              <span>Fil Public</span>
              {hasNewFeed && (
                <span
                  style={{
                    position: "absolute",
                    top: "5px",
                    right: "6px",
                    width: "7px",
                    height: "7px",
                    backgroundColor: "#ef4444",
                    borderRadius: "4px",
                  }}
                />
              )}
            </button>

            {user.username === "admin" && (
              <button
                type="button"
                onClick={() => {
                  setActiveView("announcement");
                  setActiveChatId(null);
                }}
                style={{
                  flex: 1,
                  minWidth: "90px",
                  padding: "8px 10px",
                  background: activeView === "announcement" ? "rgba(197, 160, 59, 0.2)" : "transparent",
                  color: "var(--accent-gold)",
                  border: "1px solid rgba(197, 160, 59, 0.5)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <Icon name="megaphone" size={14} color="var(--accent-gold)" />
                <span>Annonce</span>
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflow: "hidden" }} className="animate-fade-in">
            <div style={{ display: activeView === "chats" ? "flex" : "none", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              <ChatList
                user={user}
                activeChatId={activeChatId}
                onSelectChat={setActiveChatId}
                onUserUpdate={setUser}
                refreshSignal={chatsRefreshKey}
              />
            </div>
            <div style={{ display: activeView === "feed" ? "block" : "none", padding: "24px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
              Parcourez et partagez des publications avec la communauté sur le Fil Public.
            </div>
            {user.username === "admin" && (
              <div style={{ display: activeView === "announcement" ? "block" : "none", padding: "24px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Diffusez une annonce officielle à l&apos;ensemble des membres inscrits.
              </div>
            )}
          </div>
        </div>

        <div className="chat-main glass-panel animate-slide-up" style={{ animationDelay: "0.08s" }}>
          {(activeChatId || activeView === "feed" || activeView === "announcement") && (
            <div
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid var(--border-glass)",
                background: "rgba(0,0,0,0.15)",
                display: "none",
                alignItems: "center",
              }}
              className="mobile-back-btn"
            >
              <button
                type="button"
                onClick={() => {
                  setActiveChatId(null);
                  setActiveView("chats");
                }}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-glass)",
                  color: "var(--accent-gold)",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "13px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Icon name="arrow-left" size={15} color="var(--accent-gold)" />
                <span>Discussions</span>
              </button>
            </div>
          )}

          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", overflow: "hidden" }}>
            <div style={{ display: activeView === "feed" ? "flex" : "none", flexDirection: "column", flex: 1, height: "100%", overflow: "hidden" }}>
              <PublicationsFeed
                user={user}
                onStartChat={(chatId: string) => {
                  setActiveChatId(chatId);
                  setActiveView("chats");
                  setChatsRefreshKey((k) => k + 1);
                }}
              />
            </div>

            <div style={{ display: activeView === "chats" && activeChatId ? "flex" : "none", flexDirection: "column", flex: 1, height: "100%", overflow: "hidden" }}>
              {activeChatId && (
                <ChatWindow
                  user={user}
                  chatId={activeChatId}
                  onChatLeft={() => {
                    setActiveChatId(null);
                    setChatsRefreshKey((k) => k + 1);
                  }}
                  onChatsUpdated={() => setChatsRefreshKey((k) => k + 1)}
                />
              )}
            </div>

            <div
              style={{
                display: activeView === "chats" && !activeChatId ? "flex" : "none",
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "12px",
                color: "var(--text-secondary)",
                height: "100%",
              }}
            >
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "32px",
                  background: "rgba(197, 160, 59, 0.08)",
                  border: "1px solid rgba(197, 160, 59, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="message-square" size={28} color="var(--accent-gold)" />
              </div>
              <div style={{ fontSize: "15px", color: "var(--text-primary)", fontWeight: 500 }}>Sélectionnez une conversation</div>
              <div style={{ fontSize: "13px", opacity: 0.7 }}>Ou explorez l&apos;Annuaire et le Fil Public à gauche.</div>
            </div>

            {user.username === "admin" && (
              <div
                style={{
                  display: activeView === "announcement" ? "flex" : "none",
                  flexDirection: "column",
                  flex: 1,
                  height: "100%",
                  overflow: "auto",
                  padding: "32px",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AnnouncementComposer onSent={() => setChatsRefreshKey((k) => k + 1)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}

function AnnouncementComposer({ onSent }: { onSent?: () => void }) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    setError("");
    setSuccessCount(null);
    try {
      const res = await apiFetch("/chats/announcement", {
        method: "POST",
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessCount(data.sent_count);
        setContent("");
        onSent?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Échec de l'envoi de l'annonce.");
      }
    } catch {
      setError("Erreur réseau lors de l'envoi.");
    }
    setSending(false);
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: "28px",
        maxWidth: "580px",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        border: "1px solid rgba(197, 160, 59, 0.3)",
        borderRadius: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: "rgba(197, 160, 59, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="megaphone" size={22} color="var(--accent-gold)" />
        </div>
        <div style={{ textAlign: "left" }}>
          <h2 style={{ margin: 0, color: "var(--accent-gold)", fontSize: "18px" }}>Annonce Officielle</h2>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
            Ce message sera transmis en privé à chaque membre inscrit.
          </p>
        </div>
      </div>

      {successCount !== null && (
        <div
          style={{
            padding: "12px",
            background: "rgba(39, 174, 96, 0.12)",
            border: "1px solid #27ae60",
            color: "#4ade80",
            borderRadius: "10px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Icon name="check-circle" size={16} color="#4ade80" />
          <span>
            Annonce envoyée avec succès à <strong>{successCount}</strong> utilisateur(s).
          </span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px",
            background: "rgba(231, 76, 60, 0.12)",
            border: "1px solid #e74c3c",
            color: "#f87171",
            borderRadius: "10px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Icon name="alert-triangle" size={16} color="#f87171" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleBroadcast} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <textarea
          className="input-royal"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Rédigez le texte de votre annonce..."
          style={{ width: "100%", height: "170px", padding: "14px", borderRadius: "12px", resize: "vertical", fontSize: "14px", lineHeight: 1.5 }}
          required
          disabled={sending}
        />

        <button
          type="submit"
          className="btn-royal"
          disabled={sending || !content.trim()}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: "12px",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <Icon name={sending ? "clock" : "send"} size={16} color="#0A1128" />
          <span>{sending ? "Diffusion en cours..." : "Diffuser l'annonce"}</span>
        </button>
      </form>
    </div>
  );
}
