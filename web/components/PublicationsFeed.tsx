"use client";
import { useState, useEffect } from "react";
import { PublicationSkeleton } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";
import { apiFetch } from "@/lib/api";
import Icon from "./Icon";

const MAX_CHARS = 500;

export default function PublicationsFeed({ user, onStartChat }: { user: any; onStartChat?: (chatId: string) => void }) {
  const [publications, setPublications] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [shareConfig, setShareConfig] = useState<{ pubId: string; content: string; author: string } | null>(null);
  const [repostTarget, setRepostTarget] = useState<any | null>(null);
  const [repostComment, setRepostComment] = useState("");
  const [myChats, setMyChats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const { showToast } = useToast();

  const fetchPublications = async () => {
    try {
      const res = await apiFetch("/publications/");
      if (res.ok) setPublications(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchPublications();
    const interval = setInterval(fetchPublications, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const loadChatsForSharing = async () => {
    try {
      const res = await apiFetch("/chats/");
      if (res.ok) setMyChats(await res.json());
    } catch {}
  };

  const handleOpenShare = (pub: any) => {
    setShareConfig({ pubId: pub.id, content: pub.content, author: pub.author_username });
    loadChatsForSharing();
  };

  const executeShare = async (chatId: string) => {
    if (!shareConfig) return;
    const shareText = `Publication de @${shareConfig.author} :\n"${shareConfig.content}"`;
    try {
      const res = await apiFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify({ chat_id: chatId, content: shareText }),
      });
      if (res.ok) {
        setShareConfig(null);
        showToast("Publication partagée dans la discussion", "success");
      }
    } catch {
      showToast("Erreur lors du partage", "error");
    }
  };

  const submitRepost = async () => {
    if (!repostTarget) return;
    try {
      const res = await apiFetch("/publications/", {
        method: "POST",
        body: JSON.stringify({
          content: repostComment.trim() || "Publication partagée",
          repost_of_id: repostTarget.id,
        }),
      });
      if (res.ok) {
        setRepostTarget(null);
        setRepostComment("");
        fetchPublications();
        showToast("Publication republiée", "success");
      }
    } catch {
      showToast("Erreur réseau", "error");
    }
  };

  const handleMessageAuthor = async (authorUsername: string, authorFullName: string) => {
    if (!authorUsername || authorUsername === user.username) return;
    try {
      const res = await apiFetch("/chats/create", {
        method: "POST",
        body: JSON.stringify({
          type: "private",
          name: authorFullName || authorUsername,
          member_usernames: [authorUsername],
        }),
      });
      if (res.ok) {
        const chat = await res.json();
        onStartChat?.(chat.id);
      } else {
        const err = await res.json();
        showToast(err.detail || "Impossible d'ouvrir la discussion", "warning");
      }
    } catch {
      showToast("Erreur réseau", "error");
    }
  };

  const getChatDisplayName = (c: any) => {
    if (c.type === "group") return c.name;
    const other = c.members?.find((m: any) => m.user_id !== user.id);
    return other ? other.full_name || other.username : "Discussion privée";
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    if (content.length > MAX_CHARS) {
      showToast(`Maximum ${MAX_CHARS} caractères`, "warning");
      return;
    }
    setPosting(true);
    try {
      const res = await apiFetch("/publications/", {
        method: "POST",
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        setContent("");
        fetchPublications();
        showToast("Publication mise en ligne", "success");
      } else {
        const err = await res.json();
        showToast(err.detail || "Erreur de publication", "error");
      }
    } catch {
      showToast("Erreur réseau", "error");
    }
    setPosting(false);
  };

  const handleToggleLike = async (pub: any) => {
    // Optimistic update
    const wasLiked = pub.user_reaction === true;
    setPublications((prev) =>
      prev.map((p) =>
        p.id === pub.id
          ? {
              ...p,
              user_reaction: wasLiked ? null : true,
              likes: Math.max(0, (p.likes || 0) + (wasLiked ? -1 : 1)),
            }
          : p
      )
    );

    try {
      await apiFetch(`/publications/${pub.id}/react`, {
        method: "POST",
        body: JSON.stringify({ is_like: wasLiked ? null : true }),
      });
    } catch {
      fetchPublications();
    }
  };

  const handleDeletePub = async (id: string) => {
    if (!window.confirm("Voulez-vous supprimer cette publication ?")) return;
    try {
      const res = await apiFetch(`/publications/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchPublications();
        showToast("Publication supprimée", "info");
      }
    } catch {}
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const renderContentWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) =>
      part.match(/^https?:\/\//) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)", textDecoration: "underline" }}>
          {part}
        </a>
      ) : (
        part
      )
    );
  };

  const charsLeft = MAX_CHARS - content.length;
  const isOverLimit = charsLeft < 0;

  const filteredPublications = publications.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.content?.toLowerCase().includes(q) ||
      p.author_username?.toLowerCase().includes(q) ||
      p.author_full_name?.toLowerCase().includes(q) ||
      p.repost_original?.content?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-glass)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Icon name="globe" size={20} color="var(--accent-gold)" />
        <h2 style={{ margin: 0, fontSize: "19px", color: "var(--accent-gold)", fontWeight: 600 }}>Fil Public</h2>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Search Bar (Content + Author) */}
        <div
          style={{
            background: "var(--bg-glass)",
            borderRadius: "12px",
            border: "1px solid var(--border-glass)",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: "8px",
          }}
        >
          <Icon name="search" size={16} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Rechercher un texte, un sujet ou un auteur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", color: "#FFF", padding: "11px 4px", outline: "none", fontSize: "14px" }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex" }}
            >
              <Icon name="x" size={15} />
            </button>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            padding: "16px",
            borderRadius: "16px",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-glass)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "12px" }}>
            <img src={user.avatar_url} alt="" style={{ width: "40px", height: "40px", borderRadius: "20px", objectFit: "cover" }} />
            <textarea
              placeholder="Partagez une réflexion calme avec la communauté..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_CHARS + 50}
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.22)",
                border: "1px solid var(--border-glass)",
                color: "#FFF",
                resize: "none",
                height: "80px",
                padding: "12px",
                borderRadius: "12px",
                outline: "none",
                fontSize: "14px",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontSize: "12px",
                color: isOverLimit ? "#ff4d4f" : charsLeft < 50 ? "#fbbf24" : "var(--text-secondary)",
                fontWeight: isOverLimit ? 600 : 400,
              }}
            >
              {charsLeft} caractères restants
            </span>
            <button
              type="button"
              onClick={handlePost}
              disabled={posting || !content.trim() || isOverLimit}
              className="btn-royal"
              style={{
                padding: "8px 20px",
                borderRadius: "20px",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Icon name={posting ? "clock" : "send"} size={14} color="#0A1128" />
              <span>{posting ? "Publication..." : "Publier"}</span>
            </button>
          </div>
        </div>

        {/* Feed */}
        {loading ? (
          <PublicationSkeleton />
        ) : (
          <>
            {filteredPublications.map((pub) => (
              <div
                key={pub.id}
                className="animate-slide-up"
                style={{
                  padding: "16px",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.025)",
                  border: pub.is_pinned ? "1px solid var(--accent-gold)" : "1px solid var(--border-glass)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  position: "relative",
                }}
              >
                {pub.is_pinned && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-10px",
                      left: "16px",
                      background: "var(--bg-primary)",
                      padding: "2px 8px",
                      borderRadius: "8px",
                      border: "1px solid rgba(197,160,59,0.4)",
                      color: "var(--accent-gold)",
                      fontSize: "11px",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Icon name="pin" size={12} color="var(--accent-gold)" />
                    <span>Épinglé</span>
                  </div>
                )}

                {pub.repost_of_id && (
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "12px",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "-4px",
                    }}
                  >
                    <Icon name="repeat" size={13} color="var(--accent-gold)" />
                    <span>Republié par @{pub.author_username}</span>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: pub.is_pinned ? "4px" : "0" }}>
                  <img
                    src={pub.author_avatar}
                    alt=""
                    onClick={() => handleMessageAuthor(pub.author_username, pub.author_full_name)}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "20px",
                      objectFit: "cover",
                      cursor: pub.author_id !== user.id ? "pointer" : "default",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#FFF", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        onClick={() => handleMessageAuthor(pub.author_username, pub.author_full_name)}
                        style={{ cursor: pub.author_id !== user.id ? "pointer" : "default" }}
                      >
                        {pub.author_full_name || pub.author_username}
                      </span>
                      {pub.is_supreme_admin && (
                        <span title="Administration Officielle" style={{ display: "inline-flex" }}>
                          <Icon name="award" size={14} color="var(--accent-gold)" />
                        </span>
                      )}
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                      @{pub.author_username} • {formatDate(pub.created_at)}
                    </div>
                  </div>
                  {pub.author_id !== user.id && onStartChat && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleMessageAuthor(pub.author_username, pub.author_full_name)}
                      title={`Discuter en privé avec @${pub.author_username}`}
                      style={{ width: "32px", height: "32px" }}
                    >
                      <Icon name="message-square" size={15} />
                    </button>
                  )}
                </div>

                {pub.content && (
                  <div style={{ color: "#FFF", fontSize: "var(--msg-font-size, 15px)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {renderContentWithLinks(pub.content)}
                  </div>
                )}

                {/* Quoted Original Publication Card */}
                {pub.repost_original && (
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "rgba(0, 0, 0, 0.25)",
                      border: "1px solid var(--border-glass)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {pub.repost_original.author_avatar && (
                        <img
                          src={pub.repost_original.author_avatar}
                          alt=""
                          style={{ width: "20px", height: "20px", borderRadius: "10px", objectFit: "cover" }}
                        />
                      )}
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-gold)" }}>
                        {pub.repost_original.author_full_name || pub.repost_original.author_username}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        @{pub.repost_original.author_username}
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                      {renderContentWithLinks(pub.repost_original.content)}
                    </div>
                  </div>
                )}

                {/* Action Row (No Dislike — Positive Toggleable Like + Repost + Share) */}
                <div
                  style={{
                    display: "flex",
                    gap: "18px",
                    alignItems: "center",
                    marginTop: "4px",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    paddingTop: "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleLike(pub)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      color: pub.user_reaction === true ? "#f43f5e" : "var(--text-secondary)",
                      fontSize: "13px",
                      fontWeight: pub.user_reaction === true ? 600 : 400,
                    }}
                  >
                    <Icon
                      name={pub.user_reaction === true ? "heart-fill" : "heart"}
                      size={16}
                      color={pub.user_reaction === true ? "#f43f5e" : "currentColor"}
                    />
                    <span>{pub.likes || 0}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRepostTarget(pub.repost_original ? { ...pub.repost_original } : pub);
                      setRepostComment("");
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      color: "var(--text-secondary)",
                      fontSize: "13px",
                    }}
                  >
                    <Icon name="repeat" size={16} />
                    <span>{pub.reposts_count > 0 ? pub.reposts_count : "Republier"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenShare(pub)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      color: "var(--text-secondary)",
                      fontSize: "13px",
                      marginLeft: "auto",
                    }}
                  >
                    <Icon name="share" size={15} />
                    <span>Partager</span>
                  </button>

                  {(user.username === "admin" || user.id === pub.author_id) && (
                    <button
                      type="button"
                      onClick={() => handleDeletePub(pub.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#f87171",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "12px",
                      }}
                      title="Supprimer"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filteredPublications.length === 0 && (
              <div
                style={{
                  color: "var(--text-secondary)",
                  textAlign: "center",
                  marginTop: "40px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <Icon name="inbox" size={36} color="var(--text-secondary)" />
                <div>{searchQuery ? "Aucune publication ne correspond à votre recherche." : "Aucune publication pour le moment."}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Repost Modal */}
      {repostTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,9,22,0.8)",
            backdropFilter: "blur(5px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setRepostTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0E1834",
              padding: "22px",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "440px",
              border: "1px solid rgba(197,160,59,0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent-gold)", fontWeight: 600 }}>
                <Icon name="repeat" size={18} color="var(--accent-gold)" />
                <span>Republier sur le Fil Public</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setRepostTarget(null)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <textarea
              className="input-royal"
              rows={3}
              placeholder="Ajouter un commentaire (optionnel)..."
              value={repostComment}
              onChange={(e) => setRepostComment(e.target.value)}
              style={{ resize: "none", fontSize: "14px" }}
            />

            <div
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--border-glass)",
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ color: "var(--accent-gold)", fontWeight: 600, marginBottom: "4px" }}>@{repostTarget.author_username}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                {repostTarget.content}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" className="btn-alt" onClick={() => setRepostTarget(null)}>
                Annuler
              </button>
              <button type="button" className="btn-royal" onClick={submitRepost}>
                Republier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share to Chat Modal */}
      {shareConfig && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,9,22,0.8)",
            backdropFilter: "blur(5px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShareConfig(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0E1834",
              padding: "22px",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "400px",
              border: "1px solid rgba(197,160,59,0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, color: "var(--accent-gold)", fontSize: "16px" }}>Partager dans une discussion</h3>
              <button type="button" className="icon-btn" onClick={() => setShareConfig(null)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div style={{ maxHeight: "280px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {myChats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => executeShare(c.id)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-glass)",
                    color: "#FFF",
                    borderRadius: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "18px",
                      background: "rgba(197,160,59,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={c.type === "group" ? "users" : "user"} size={17} color="var(--accent-gold)" />
                  </div>
                  <span style={{ fontWeight: 500, fontSize: "14px" }}>{getChatDisplayName(c)}</span>
                </button>
              ))}
              {myChats.length === 0 && <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>Aucune discussion active.</span>}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn-alt"
                onClick={() => {
                  navigator.clipboard?.writeText(`@${shareConfig.author}: ${shareConfig.content}`);
                  setShareConfig(null);
                  showToast("Texte copié", "info");
                }}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Icon name="copy" size={14} />
                <span>Copier</span>
              </button>
              <button type="button" className="btn-alt" onClick={() => setShareConfig(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
