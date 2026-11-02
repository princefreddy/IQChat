import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking, ActivityIndicator, Modal, Alert } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { getUploadUrl, apiFetch } from "../lib/api";

import TicTacToe from "./games/TicTacToe";
import Connect4 from "./games/Connect4";
import RockPaperScissors from "./games/RockPaperScissors";
import WordMystery from "./games/WordMystery";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🔥"];

export function VoicePlayer({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  const isPlaying = !!status.playing;
  const durationSecs = status.duration || 0;
  const positionSecs = status.currentTime || 0;
  const isBuffering = !!status.isBuffering && !status.isLoaded;

  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        player.pause();
      } else {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
        if (durationSecs > 0 && positionSecs >= durationSecs - 0.15) {
          await player.seekTo(0);
        }
        player.play();
      }
    } catch {
      // silent
    }
  };

  const formatTime = (secs: number) => {
    const totalSecs = Math.max(0, Math.floor(secs || 0));
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progress = durationSecs > 0 ? Math.min(1, positionSecs / durationSecs) : 0;

  return (
    <View style={styles.audioPlayerContainer}>
      <TouchableOpacity onPress={handlePlayPause} disabled={isBuffering} style={styles.playButton}>
        {isBuffering ? (
          <ActivityIndicator size="small" color="#C5A03B" />
        ) : (
          <Feather name={isPlaying ? "pause" : "play"} size={15} color="#C5A03B" />
        )}
      </TouchableOpacity>
      <View style={styles.progressSection}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(positionSecs)}</Text>
          <Text style={styles.timeText}>{durationSecs > 0 ? formatTime(durationSecs) : "0:00"}</Text>
        </View>
      </View>
    </View>
  );
}

function ChatVideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={{ width: 240, height: 175, borderRadius: 10 }}
      contentFit="contain"
      nativeControls
    />
  );
}

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
  const [showActions, setShowActions] = useState(false);
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
  const msgFontSize =
    userSettings?.font_size === "compact" ? 13 : userSettings?.font_size === "large" ? 17 : 15;

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
          if (!cancelled && data && (data.title || data.image)) setLinkPreview(data);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    } else {
      setLinkPreview(null);
    }
  }, [message.content, isHidden, isGame, linkPreviewsAllowed]);

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
    const timer = setInterval(checkLock, 1000);
    return () => clearInterval(timer);
  }, [message.visible_at, isOwn, message.content, message.file_url, onUnlockRefresh]);

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

  if (isTimeLocked) {
    return (
      <View style={[styles.container, isOwn ? styles.alignRight : styles.alignLeft, { opacity: 0.88 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Feather name="clock" size={11} color="#C5A03B" />
          <Text style={styles.modeLabel}>Message différé</Text>
        </View>
        <View style={{ padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(197,160,59,0.45)" }}>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 6 }}>
            Déverrouillage dans <Text style={{ color: "#FFF", fontWeight: "700" }}>{lockRemaining}</Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="lock" size={14} color="#C5A03B" />
            <Text style={{ fontSize: 13, color: "#C5A03B", fontWeight: "700" }}>Contenu programmé</Text>
          </View>
        </View>
      </View>
    );
  }

  if (message.type === "ephemeral" && timeLeft !== null && timeLeft <= 0) {
    return (
      <View style={[styles.container, isOwn ? styles.alignRight : styles.alignLeft, { opacity: 0.55 }]}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: "#334155", borderStyle: "dashed", flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="clock" size={12} color="#94A3B8" />
          <Text style={{ fontSize: 12, fontStyle: "italic", color: "#94A3B8" }}>Ce message éphémère a expiré</Text>
        </View>
      </View>
    );
  }

  const timeStr = new Date(
    message.created_at?.endsWith("Z") || message.created_at?.includes("+")
      ? message.created_at
      : `${message.created_at}Z`
  ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const reactionsMap: Record<string, string[]> =
    message.reactions && typeof message.reactions === "object" && !Array.isArray(message.reactions)
      ? message.reactions
      : message.reaction
      ? { [message.reaction]: [] }
      : {};
  const reactionEntries = Object.entries(reactionsMap).filter(([, users]) => Array.isArray(users));

  const openActionsSheet = () => {
    if (message.status === "sending") return;
    if (userSettings?.haptics_enabled !== false) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowActions(true);
  };

  const renderAttachment = () => {
    if (!message.file_url) return null;
    const url = getUploadUrl(message.file_url);

    if (message.file_type === "image") {
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => (onViewImage ? onViewImage(url) : Linking.openURL(url))}
          onLongPress={openActionsSheet}
          style={{ marginTop: message.content ? 8 : 0, borderRadius: 10, overflow: "hidden" }}
        >
          <Image source={{ uri: url }} style={{ width: 240, height: 190, borderRadius: 10 }} resizeMode="cover" />
        </TouchableOpacity>
      );
    }

    if (message.file_type === "video") {
      return (
        <View style={{ marginTop: message.content ? 8 : 0, borderRadius: 10, overflow: "hidden" }}>
          <ChatVideoPlayer url={url} />
        </View>
      );
    }

    if (message.file_type === "audio") {
      return <VoicePlayer url={url} />;
    }

    return (
      <TouchableOpacity
        onPress={() => Linking.openURL(url)}
        style={{
          marginTop: message.content ? 8 : 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 10,
          backgroundColor: "rgba(0,0,0,0.25)",
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        <Feather name="file-text" size={20} color="#C5A03B" />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: "#C5A03B", fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
            {message.file_name || "Document joint"}
          </Text>
          <Text style={{ color: "#94A3B8", fontSize: 11 }}>Appuyer pour ouvrir</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isOwn ? styles.alignRight : styles.alignLeft]}>
      {/* Mode Badge */}
      {(message.type === "hidden" || message.type === "ephemeral" || message.visible_at || message.is_own_anonymous) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Feather
            name={
              message.is_own_anonymous
                ? "eye-off"
                : message.type === "hidden"
                ? "eye"
                : message.type === "ephemeral"
                ? "clock"
                : "calendar"
            }
            size={11}
            color="#C5A03B"
          />
          <Text style={styles.modeLabel}>
            {message.is_own_anonymous
              ? "Envoyé anonymement"
              : message.type === "hidden"
              ? "Message caché"
              : message.type === "ephemeral"
              ? "Éphémère"
              : lockRemaining
              ? `Différé (${lockRemaining})`
              : "Différé"}
          </Text>
        </View>
      )}

      {/* Sender Info */}
      {!isOwn && (
        <View style={styles.senderInfo}>
          {message.is_anonymous ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Feather name="eye-off" size={12} color="#94A3B8" />
              <Text style={styles.senderText}>Anonyme</Text>
            </View>
          ) : (
            <>
              {message.sender_avatar ? <Image source={{ uri: message.sender_avatar }} style={styles.avatar} /> : null}
              <Text style={styles.senderText}>{message.sender_username}</Text>
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          if (isHidden) setIsRevealed(!isRevealed);
        }}
        onLongPress={openActionsSheet}
        delayLongPress={260}
        style={[
          styles.bubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
          isHidden && !isRevealed && styles.bubbleHidden,
          message.status === "sending" && { opacity: 0.65 },
        ]}
      >
        {isHidden && !isRevealed ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
            <Feather name="eye" size={16} color="#C5A03B" />
            <Text style={styles.hiddenText}>Appuyer pour révéler</Text>
          </View>
        ) : (
          <View>
            {/* Quoted Reply */}
            {message.reply_to_id ? (
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.22)",
                  borderLeftWidth: 3,
                  borderLeftColor: isOwn ? "rgba(255,255,255,0.65)" : "#C5A03B",
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              >
                <Text style={{ color: isOwn ? "rgba(255,255,255,0.85)" : "#C5A03B", fontWeight: "700", fontSize: 12, marginBottom: 1 }}>
                  {message.reply_to_sender || "Message"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }} numberOfLines={1}>
                  {message.reply_to_content || "Pièce jointe"}
                </Text>
              </View>
            ) : null}

            {/* Body */}
            {message.type === "game_tictactoe" ? (
              <TicTacToe message={message} currentUserId={currentUserId} />
            ) : message.type === "game_connect4" ? (
              <Connect4 message={message} currentUserId={currentUserId} />
            ) : message.type === "game_rps" ? (
              <RockPaperScissors message={message} currentUserId={currentUserId} />
            ) : message.type === "game_word_mystery" ? (
              <WordMystery message={message} currentUserId={currentUserId} />
            ) : message.content ? (
              <Text style={[styles.text, { fontSize: msgFontSize }]}>
                {message.content.split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) =>
                  part.match(/^https?:\/\//) ? (
                    <Text
                      key={i}
                      style={{ color: isOwn ? "#FDE68A" : "#C5A03B", textDecorationLine: "underline" }}
                      onPress={() => Linking.openURL(part)}
                    >
                      {part}
                    </Text>
                  ) : (
                    part
                  )
                )}
              </Text>
            ) : null}

            {renderAttachment()}

            {linkPreview ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => Linking.openURL(linkPreview.url)}
                style={{
                  marginTop: 8,
                  borderRadius: 8,
                  overflow: "hidden",
                  backgroundColor: "rgba(0,0,0,0.28)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                }}
              >
                {linkPreview.image ? (
                  <Image source={{ uri: linkPreview.image }} style={{ width: "100%", height: 115 }} resizeMode="cover" />
                ) : null}
                <View style={{ padding: 8 }}>
                  <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                    {linkPreview.title || linkPreview.url}
                  </Text>
                  {linkPreview.description ? (
                    <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 3 }} numberOfLines={2}>
                      {linkPreview.description}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ) : null}

            {/* Footer: Ephemeral + Time + Read status */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5, marginTop: 4 }}>
              {message.type === "ephemeral" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Feather name="clock" size={10} color={isOwn ? "rgba(255,255,255,0.75)" : "#C5A03B"} />
                  <Text style={{ fontSize: 10, color: isOwn ? "rgba(255,255,255,0.75)" : "#C5A03B" }}>
                    {timeLeft !== null ? `${timeLeft}s` : "À la lecture"}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 10, color: isOwn ? "rgba(255,255,255,0.65)" : "#94A3B8" }}>{timeStr}</Text>
              {isOwn &&
                (message.status === "sending" ? (
                  <Feather name="clock" size={11} color="rgba(255,255,255,0.5)" />
                ) : message.status === "error" ? (
                  <Feather name="alert-circle" size={12} color="#f87171" />
                ) : message.is_read ? (
                  <Ionicons name="checkmark-done" size={14} color="#93c5fd" />
                ) : (
                  <Ionicons name="checkmark" size={13} color="rgba(255,255,255,0.6)" />
                ))}
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Reactions Pills */}
      {reactionEntries.length > 0 && (
        <View style={[styles.reactionsRow, isOwn ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }]}>
          {reactionEntries.map(([emoji, users]) => {
            const mine = users.includes(currentUserId);
            const count = users.length || 1;
            return (
              <TouchableOpacity
                key={emoji}
                onPress={() => onReaction?.(message.id, emoji)}
                style={[styles.reactionPill, mine && styles.reactionPillMine]}
              >
                <Text style={{ fontSize: 12 }}>{emoji}</Text>
                {count > 1 && <Text style={{ fontSize: 11, color: "#94A3B8" }}>{count}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Long-Press Action Modal */}
      <Modal visible={showActions} transparent animationType="fade" onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(5,9,22,0.72)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowActions(false)}
        >
          <View style={styles.actionSheet}>
            <View style={styles.emojiPickerRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => {
                    setShowActions(false);
                    onReaction?.(message.id, emoji);
                  }}
                  style={styles.emojiBtn}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {onReply && (
              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => {
                  setShowActions(false);
                  onReply(message);
                }}
              >
                <Feather name="corner-up-left" size={18} color="#C5A03B" />
                <Text style={styles.sheetItemText}>Répondre à ce message</Text>
              </TouchableOpacity>
            )}

            {message.content && !isGame && !isHidden ? (
              <TouchableOpacity
                style={styles.sheetItem}
                onPress={async () => {
                  await Clipboard.setStringAsync(message.content);
                  setShowActions(false);
                }}
              >
                <Feather name="copy" size={18} color="#E2E8F0" />
                <Text style={styles.sheetItemText}>Copier le texte</Text>
              </TouchableOpacity>
            ) : null}

            {isOwn && onDelete ? (
              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => {
                  setShowActions(false);
                  Alert.alert("Supprimer le message", "Voulez-vous supprimer ce message pour tout le monde ?", [
                    { text: "Annuler", style: "cancel" },
                    { text: "Supprimer", style: "destructive", onPress: () => onDelete(message.id) },
                  ]);
                }}
              >
                <Feather name="trash-2" size={18} color="#f87171" />
                <Text style={[styles.sheetItemText, { color: "#f87171" }]}>Supprimer le message</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 7, maxWidth: "84%" },
  alignRight: { alignSelf: "flex-end", alignItems: "flex-end" },
  alignLeft: { alignSelf: "flex-start", alignItems: "flex-start" },
  modeLabel: { fontSize: 10, color: "#C5A03B", textTransform: "uppercase", letterSpacing: 0.6 },
  senderInfo: { flexDirection: "row", alignItems: "center", marginBottom: 4, marginLeft: 4, gap: 6 },
  avatar: { width: 18, height: 18, borderRadius: 9 },
  senderText: { fontSize: 12, color: "#94A3B8", fontWeight: "500" },
  bubble: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  bubbleOwn: { backgroundColor: "#2E5B88", borderBottomRightRadius: 4, borderColor: "rgba(255,255,255,0.12)" },
  bubbleOther: { backgroundColor: "rgba(255,255,255,0.06)", borderBottomLeftRadius: 4, borderColor: "rgba(255,255,255,0.09)" },
  bubbleHidden: { backgroundColor: "rgba(197, 160, 59, 0.12)", borderColor: "rgba(197, 160, 59, 0.35)" },
  hiddenText: { color: "#FFF", fontWeight: "600", fontSize: 13 },
  text: { color: "#FFF", lineHeight: 21 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  reactionPillMine: {
    backgroundColor: "rgba(197, 160, 59, 0.18)",
    borderColor: "#C5A03B",
  },
  audioPlayerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 8,
    width: 215,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.24)",
    marginTop: 4,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(197,160,59,0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C5A03B",
  },
  progressSection: { flex: 1, justifyContent: "center" },
  progressBarBg: { height: 4, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 2 },
  progressBarFill: { height: 4, backgroundColor: "#C5A03B", borderRadius: 2 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  timeText: { fontSize: 10, color: "#94A3B8" },
  actionSheet: {
    backgroundColor: "#0E1834",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: "rgba(197,160,59,0.3)",
    gap: 8,
  },
  emojiPickerRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  sheetItemText: { color: "#FFF", fontSize: 15, fontWeight: "500" },
});
