"use client";
import { useState, useEffect, useRef } from "react";
import { getUploadUrl, apiFetch } from "@/lib/api";
import { useToast } from "./ToastProvider";
import Icon from "./Icon";

import TicTacToe from "./games/TicTacToe";
import Connect4 from "./games/Connect4";
import RockPaperScissors from "./games/RockPaperScissors";
import WordMystery from "./games/WordMystery";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🔥"];

export default function MessageBubble({
  message,
  isOwn: isOwnProp,
  currentUserId,
  userSettings,
  onReaction,
  onReply,
  onDelete,
  onViewImage,
  onUnlockRefresh,
}: any) {
  const isOwn = isOwnProp || !!message.is_own_anonymous;
  const [isRevealed, setIsRevealed] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const { showToast } = useToast();
  const unlockedTriggeredRef = useRef(false);

  const parseUtc = (iso: string) =>
    new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).getTime();

  const getInitialTimeLeft = () => {
    if (message.type === "ephemeral" && message.expires_at) {
      const diff = Math.floor((parseUtc(message.expires_at) - Date.now()) / 1000);
      return diff > 0 ? diff : 0;
    }
    return null;
  };

  const [timeLeft, setTimeLeft] = useState<number | null>(getInitialTimeLeft);
  const [linkPreview, setLinkPreview] = useState<any>(null);

  const isHidden = message.type === "hidden" && !isOwn;
  const isGame = typeof message.type === "string" && message.type.startsWith("game_");
  const linkPreviewsAllowed = userSettings?.link_previews_enabled !== false;

  useEffect(() => {
    if (!linkPreviewsAllowed || isHidden || isGame || !message.content) {
      setLinkPreview(null);
      return;
    }
    const match = message.content.match(/(https?:\/\/[^\s]+)/g);
    if (match && match[0]) {
      let cancelled = false;
      apiFetch(`/utils/link-preview?url=${encodeURIComponent(match[0])}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled && data && (data.title || data.image)) {
            setLinkPreview(data);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    } else {
      setLinkPreview(null);
    }
  }, [message.content, isHidden, isGame, linkPreviewsAllowed]);

  useEffect(() => {
    if (message.type !== "ephemeral" || !message.expires_at) {
      setTimeLeft(null);
      return;
    }
    const checkExpiry = () => {
      const diff = Math.floor((parseUtc(message.expires_at) - Date.now()) / 1000);
      setTimeLeft(diff > 0 ? diff : 0);
    };
    checkExpiry();
    const timer = setInterval(checkExpiry, 1000);
    return () => clearInterval(timer);
  }, [message.type, message.expires_at]);

  const [isTimeLocked, setIsTimeLocked] = useState(false);
  const [lockRemaining, setLockRemaining] = useState("");

  useEffect(() => {
    if (!message.visible_at) {
      setIsTimeLocked(false);
      return;
    }
    const checkLock = () => {
      const now = Date.now();
      const visibleTime = parseUtc(message.visible_at);
      if (visibleTime > now) {
        const diff = Math.floor((visibleTime - now) / 1000);
        if (diff < 60) setLockRemaining(`${diff}s`);
        else if (diff < 3600) setLockRemaining(`${Math.floor(diff / 60)}m ${diff % 60}s`);
        else setLockRemaining(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`);
        setIsTimeLocked(!isOwn);
      } else {
        setLockRemaining("");
        if (!isOwn && !message.content && !message.file_url && !unlockedTriggeredRef.current) {
          unlockedTriggeredRef.current = true;
          onUnlockRefresh?.();
        }
        setIsTimeLocked(false);
      }
    };
    checkLock();
    const interval = setInterval(checkLock, 1000);
    return () => clearInterval(interval);
  }, [message.visible_at, isOwn, message.content, message.file_url, onUnlockRefresh]);

  if (isTimeLocked) {
    return (
      <div
        id={`msg-${message.id}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isOwn ? "flex-end" : "flex-start",
          margin: "12px 0",
          opacity: 0.88,
        }}
      >
        <div
          style={{
            fontSize: "10px",
            color: "var(--accent-gold)",
            marginBottom: "4px",
            textTransform: "uppercase",
            letterSpacing: "0.8px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Icon name="clock" size={11} color="var(--accent-gold)" />
          <span>Message différé</span>
        </div>
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "16px",
            background: "var(--bg-glass)",
            border: "1px solid rgba(197, 160, 59, 0.45)",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>
            Déverrouillage dans <strong>{lockRemaining}</strong>
          </div>
          <div style={{ fontSize: "13px", color: "var(--accent-gold)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
            <Icon name="lock" size={14} color="var(--accent-gold)" />
            <span>Contenu programmé</span>
          </div>
        </div>
      </div>
    );
  }

  if (message.type === "ephemeral" && timeLeft !== null && timeLeft <= 0) {
    return (
      <div
        id={`msg-${message.id}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isOwn ? "flex-end" : "flex-start",
          margin: "10px 0",
          opacity: 0.55,
        }}
      >
        <div
          style={{
            padding: "8px 14px",
            borderRadius: "14px",
            background: "transparent",
            border: "1px dashed var(--border-glass)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Icon name="hourglass" size={12} color="var(--text-secondary)" />
          <span style={{ fontSize: "12px", fontStyle: "italic", color: "var(--text-secondary)" }}>
            Ce message éphémère a expiré
          </span>
        </div>
      </div>
    );
  }

  const timeStr = new Date(
    message.created_at?.endsWith("Z") || message.created_at?.includes("+")
      ? message.created_at
      : `${message.created_at}Z`
  ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Build normalized reactions map: { emoji: string[] }
  const reactionsMap: Record<string, string[]> =
    message.reactions && typeof message.reactions === "object" && !Array.isArray(message.reactions)
      ? message.reactions
      : message.reaction
      ? { [message.reaction]: [] }
      : {};
  const reactionEntries = Object.entries(reactionsMap).filter(([, users]) => Array.isArray(users));

  const handleCopy = () => {
    if (!message.content || isGame) return;
    navigator.clipboard?.writeText(message.content);
    showToast("Message copié", "info");
  };

  const renderAttachment = () => {
    if (!message.file_url) return null;
    const url = getUploadUrl(message.file_url);

    if (message.file_type === "image") {
      return (
        <div style={{ marginTop: message.content ? "8px" : "0", borderRadius: "10px", overflow: "hidden" }}>
          <img
            src={url}
            alt={message.file_name || "Image"}
            style={{
              maxWidth: "300px",
              maxHeight: "260px",
              objectFit: "cover",
              borderRadius: "10px",
              cursor: "pointer",
              display: "block",
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onViewImage) onViewImage(url);
            }}
          />
        </div>
      );
    }

    if (message.file_type === "video") {
      return (
        <div style={{ marginTop: message.content ? "8px" : "0", borderRadius: "10px", overflow: "hidden" }}>
          <video src={url} controls style={{ maxWidth: "300px", maxHeight: "250px", borderRadius: "10px" }} />
        </div>
      );
    }

    if (message.file_type === "audio") {
      return (
        <div style={{ marginTop: message.content ? "6px" : "0", display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name="mic" size={15} color={isOwn ? "#FFF" : "var(--accent-gold)"} />
          <audio src={url} controls style={{ height: "36px", maxWidth: "250px" }} />
        </div>
      );
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          marginTop: message.content ? "8px" : "0",
          padding: "10px 14px",
          borderRadius: "10px",
          background: "rgba(0,0,0,0.22)",
          border: "1px solid var(--border-glass)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <Icon name="file" size={20} color="var(--accent-gold)" />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              color: "var(--accent-gold)",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {message.file_name || "Document joint"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Ouvrir le fichier</div>
        </div>
      </a>
    );
  };

  return (
    <div
      id={`msg-${message.id}`}
      className="msg-row"
      onMouseLeave={() => setShowReactionPicker(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isOwn ? "flex-end" : "flex-start",
        margin: "10px 0",
        transition: "background 0.4s ease",
        borderRadius: "12px",
      }}
    >
      {/* Mode Badge */}
      {(message.type === "hidden" || message.type === "ephemeral" || message.visible_at || message.is_own_anonymous) && (
        <div
          style={{
            fontSize: "10px",
            color: "var(--accent-gold)",
            marginBottom: "4px",
            textTransform: "uppercase",
            letterSpacing: "0.7px",
            opacity: 0.85,
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          {message.is_own_anonymous && (
            <>
              <Icon name="eye-off" size={11} color="var(--accent-gold)" />
              <span>Envoyé anonymement</span>
            </>
          )}
          {message.type === "hidden" && (
            <>
              <Icon name="eye" size={11} color="var(--accent-gold)" />
              <span>Message caché</span>
            </>
          )}
          {message.type === "ephemeral" && (
            <>
              <Icon name="hourglass" size={11} color="var(--accent-gold)" />
              <span>Éphémère</span>
            </>
          )}
          {message.visible_at && (
            <>
              <Icon name="clock" size={11} color="var(--accent-gold)" />
              <span>{lockRemaining ? `Différé (${lockRemaining})` : "Différé"}</span>
            </>
          )}
        </div>
      )}

      {/* Sender Info */}
      {!isOwn && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", marginLeft: "4px" }}>
          {message.is_anonymous ? (
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px" }}>
              <Icon name="eye-off" size={13} color="var(--text-secondary)" />
              <span>Anonyme</span>
            </div>
          ) : (
            <>
              {message.sender_avatar && (
                <img src={message.sender_avatar} alt="" style={{ width: "18px", height: "18px", borderRadius: "9px", objectFit: "cover" }} />
              )}
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>{message.sender_username}</div>
            </>
          )}
        </div>
      )}

      {/* Bubble + Hover Actions */}
      <div
        style={{
          display: "flex",
          flexDirection: isOwn ? "row-reverse" : "row",
          alignItems: "center",
          gap: "8px",
          maxWidth: "82%",
          position: "relative",
        }}
      >
        <div
          onClick={() => {
            if (isHidden) setIsRevealed(!isRevealed);
          }}
          style={{
            background: isOwn ? "var(--accent-royal)" : "var(--bg-glass)",
            padding: "11px 15px",
            borderRadius: "16px",
            borderBottomRightRadius: isOwn ? "4px" : "16px",
            borderBottomLeftRadius: !isOwn ? "4px" : "16px",
            cursor: isHidden ? "pointer" : "default",
            border: "1px solid var(--border-glass)",
            position: "relative",
            overflow: "hidden",
            transition: "all 0.25s",
            opacity: message.status === "sending" ? 0.65 : 1,
            fontSize: "var(--msg-font-size, 15px)",
          }}
        >
          {isHidden && !isRevealed && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backdropFilter: "blur(9px)",
                background: "rgba(10, 17, 40, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                zIndex: 10,
                padding: "0 12px",
              }}
            >
              <Icon name="eye" size={15} color="var(--accent-gold)" />
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#FFF" }}>Cliquer pour révéler</span>
            </div>
          )}

          <div
            style={{
              filter: isHidden && !isRevealed ? "blur(7px)" : "none",
              transition: "filter 0.25s",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {/* Quoted Reply */}
            {message.reply_to_id && (
              <div
                style={{
                  background: "rgba(0,0,0,0.22)",
                  borderLeft: `3px solid ${isOwn ? "rgba(255,255,255,0.6)" : "var(--accent-gold)"}`,
                  padding: "6px 10px",
                  borderRadius: "6px",
                  marginBottom: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const el = document.getElementById(`msg-${message.reply_to_id}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <div style={{ color: isOwn ? "rgba(255,255,255,0.85)" : "var(--accent-gold)", fontWeight: 600, marginBottom: "2px" }}>
                  {message.reply_to_sender || "Message"}
                </div>
                <div
                  style={{
                    color: isOwn ? "rgba(255,255,255,0.7)" : "var(--text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "240px",
                  }}
                >
                  {message.reply_to_content || "Pièce jointe"}
                </div>
              </div>
            )}

            {/* Body */}
            {message.type === "game_tictactoe" ? (
              <TicTacToe message={message} currentUserId={currentUserId} />
            ) : message.type === "game_connect4" ? (
              <Connect4 message={message} currentUserId={currentUserId} />
            ) : message.type === "game_rps" ? (
              <RockPaperScissors message={message} currentUserId={currentUserId} />
            ) : message.type === "game_word_mystery" ? (
              <WordMystery message={message} currentUserId={currentUserId} />
            ) : (
              message.content && (
                <div style={{ lineHeight: 1.45 }}>
                  <span style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {message.content.split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) =>
                      part.match(/^https?:\/\//) ? (
                        <a
                          key={i}
                          href={part}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: isOwn ? "#fde68a" : "var(--accent-gold)", textDecoration: "underline" }}
                        >
                          {part}
                        </a>
                      ) : (
                        part
                      )
                    )}
                  </span>
                </div>
              )
            )}

            {renderAttachment()}

            {/* Rich Link Preview */}
            {linkPreview && (
              <a href={linkPreview.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                <div
                  style={{
                    marginTop: "8px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--border-glass)",
                    maxWidth: "300px",
                  }}
                >
                  {linkPreview.image && (
                    <img src={linkPreview.image} alt="" style={{ width: "100%", maxHeight: "140px", objectFit: "cover", display: "block" }} />
                  )}
                  <div style={{ padding: "8px 10px" }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "white",
                        marginBottom: "2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {linkPreview.title || linkPreview.url}
                    </div>
                    {linkPreview.description && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-secondary)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {linkPreview.description}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            )}

            {/* Footer: Ephemeral status + Time + Read Check */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", marginTop: "2px" }}>
              {message.type === "ephemeral" && (
                <span
                  style={{
                    fontSize: "10px",
                    color: isOwn ? "rgba(255,255,255,0.75)" : "var(--accent-gold)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Icon name="hourglass" size={10} />
                  <span>{timeLeft !== null ? `${timeLeft}s` : "À la lecture"}</span>
                </span>
              )}
              <span style={{ fontSize: "10px", color: isOwn ? "rgba(255,255,255,0.65)" : "var(--text-secondary)" }}>{timeStr}</span>
              {isOwn &&
                (message.status === "sending" ? (
                  <Icon name="clock" size={11} color="rgba(255,255,255,0.5)" />
                ) : message.status === "error" ? (
                  <span title="Échec de l'envoi">
                    <Icon name="alert-triangle" size={12} color="#ff4d4f" />
                  </span>
                ) : message.is_read ? (
                  <span className="read-check" style={{ display: "inline-flex" }} title="Lu">
                    <Icon name="check-double" size={13} color="#93c5fd" strokeWidth={2.3} />
                  </span>
                ) : (
                  <span style={{ display: "inline-flex" }} title="Envoyé">
                    <Icon name="check" size={12} color="rgba(255,255,255,0.55)" strokeWidth={2.2} />
                  </span>
                ))}
            </div>
          </div>
        </div>

        {/* Hover Action Toolbar */}
        {message.status !== "sending" && (
          <div
            className="msg-hover-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              background: "rgba(14, 24, 52, 0.92)",
              border: "1px solid var(--border-glass)",
              borderRadius: "10px",
              padding: "3px",
              position: "relative",
            }}
          >
            {onReaction && (
              <button
                type="button"
                className="icon-btn"
                style={{ width: "28px", height: "28px", border: "none" }}
                title="Réagir"
                onClick={() => setShowReactionPicker((v) => !v)}
              >
                <Icon name="smile" size={14} />
              </button>
            )}
            {onReply && (
              <button
                type="button"
                className="icon-btn"
                style={{ width: "28px", height: "28px", border: "none" }}
                title="Répondre"
                onClick={() => onReply(message)}
              >
                <Icon name="reply" size={14} />
              </button>
            )}
            {message.content && !isGame && !isHidden && (
              <button
                type="button"
                className="icon-btn"
                style={{ width: "28px", height: "28px", border: "none" }}
                title="Copier"
                onClick={handleCopy}
              >
                <Icon name="copy" size={14} />
              </button>
            )}
            {isOwn && onDelete && (
              <button
                type="button"
                className="icon-btn danger"
                style={{ width: "28px", height: "28px", border: "none" }}
                title="Supprimer"
                onClick={() => onDelete(message.id)}
              >
                <Icon name="trash" size={14} />
              </button>
            )}

            {showReactionPicker && (
              <div
                style={{
                  position: "absolute",
                  bottom: "36px",
                  [isOwn ? "right" : "left"]: 0,
                  background: "#0E1834",
                  border: "1px solid rgba(197, 160, 59, 0.35)",
                  borderRadius: "20px",
                  padding: "4px 8px",
                  display: "flex",
                  gap: "6px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                  zIndex: 40,
                }}
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReaction(message.id, emoji);
                      setShowReactionPicker(false);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      fontSize: "16px",
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: "8px",
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reactions Pills */}
      {reactionEntries.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            marginTop: "4px",
            justifyContent: isOwn ? "flex-end" : "flex-start",
          }}
        >
          {reactionEntries.map(([emoji, users]) => {
            const mine = users.includes(currentUserId);
            const count = users.length || 1;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReaction?.(message.id, emoji)}
                style={{
                  background: mine ? "rgba(197, 160, 59, 0.18)" : "var(--bg-glass)",
                  border: `1px solid ${mine ? "var(--accent-gold)" : "var(--border-glass)"}`,
                  borderRadius: "12px",
                  padding: "2px 8px",
                  fontSize: "12px",
                  color: "white",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>{emoji}</span>
                {count > 1 && <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
