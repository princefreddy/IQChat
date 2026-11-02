import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Audio } from "expo-av";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uploadFile, getUploadUrl } from "../lib/api";
import { VoicePlayer } from "./MessageBubble";

interface MessageInputProps {
  user?: any;
  onSend: (data: any) => void;
  onTyping?: (isTyping: boolean) => void;
  replyingTo?: any;
  onCancelReply?: () => void;
  externalDelayedUntil?: string | null;
  onClearExternalDelay?: () => void;
}

export default function MessageInput({
  user,
  onSend,
  onTyping,
  replyingTo,
  onCancelReply,
  externalDelayedUntil,
  onClearExternalDelay,
}: MessageInputProps) {
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [msgType, setMsgType] = useState<"normal" | "hidden" | "ephemeral" | "delayed">("normal");
  const [ephemeralTtl, setEphemeralTtl] = useState<number>(user?.default_ephemeral_ttl || 10);
  const [delayedDate, setDelayedDate] = useState(new Date(Date.now() + 3600000));
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");

  const [showPlusSheet, setShowPlusSheet] = useState(false);
  const [showModeSheet, setShowModeSheet] = useState(false);
  const [wordMysteryInput, setWordMysteryInput] = useState("");
  const [showWordInput, setShowWordInput] = useState(false);

  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; file_type: string; file_name: string } | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hapticsOn = user?.haptics_enabled !== false;

  useEffect(() => {
    if (user?.default_ephemeral_ttl) setEphemeralTtl(user.default_ephemeral_ttl);
  }, [user?.default_ephemeral_ttl]);

  useEffect(() => {
    if (externalDelayedUntil) {
      const target = new Date(externalDelayedUntil);
      if (!isNaN(target.getTime())) {
        setDelayedDate(target);
        setMsgType("delayed");
      }
      onClearExternalDelay?.();
    }
  }, [externalDelayedUntil, onClearExternalDelay]);

  const applyDelayPreset = (preset: "1h" | "tonight" | "tomorrow") => {
    const now = new Date();
    const target = new Date(now);
    if (preset === "1h") target.setHours(target.getHours() + 1);
    else if (preset === "tonight") {
      target.setHours(20, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
    } else {
      target.setDate(target.getDate() + 1);
      target.setHours(8, 0, 0, 0);
    }
    setDelayedDate(target);
    setMsgType("delayed");
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === "granted") {
        if (hapticsOn) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording: newRecording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        setRecording(newRecording);
        setIsRecording(true);
        setRecordingDuration(0);
        timerRef.current = setInterval(() => setRecordingDuration((p) => p + 1), 1000);
      } else {
        Alert.alert("Permission requise", "Veuillez autoriser l'accès au microphone.");
      }
    } catch {}
  };

  const finishRecording = async (sendImmediately: boolean) => {
    if (!recording) return;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      if (hapticsOn) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) return;

      setUploadingFile(true);
      try {
        const uploaded = await uploadFile(uri, "message_vocal.m4a", "audio/mp4");
        const voiceFile = {
          url: uploaded.url,
          file_type: "audio",
          file_name: "Message vocal",
        };
        if (sendImmediately) {
          dispatchSend("", voiceFile);
        } else {
          setPendingFile(voiceFile);
        }
      } catch (err: any) {
        Alert.alert("Erreur", err.message || "Échec de l'envoi du message vocal.");
      }
      setUploadingFile(false);
    } catch {
      setRecording(null);
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      if (hapticsOn) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await recording.stopAndUnloadAsync();
    } catch {}
    setRecording(null);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const handleTyping = useCallback(() => {
    if (!onTyping) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping(false);
    }, 2000);
  }, [onTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current && onTyping) onTyping(false);
    };
  }, [onTyping]);

  const startGame = (type: string) => {
    const contentObj: any = {
      player_x: null,
      player_o: null,
      winner: null,
      status: "playing",
    };

    if (type === "game_tictactoe") {
      contentObj.board = ["", "", "", "", "", "", "", "", ""];
      contentObj.current_turn = "x";
    } else if (type === "game_connect4") {
      contentObj.board = Array(42).fill("");
      contentObj.current_turn = "x";
    } else if (type === "game_rps") {
      contentObj.player_x_choice = null;
      contentObj.player_o_choice = null;
    } else if (type === "game_word_mystery") {
      if (!wordMysteryInput.trim()) return;
      contentObj.target_word = wordMysteryInput.trim().toUpperCase();
      contentObj.guesses = [];
    }

    onSend({
      content: JSON.stringify(contentObj),
      type,
      is_anonymous: false,
      ttl: null,
      visible_at: null,
      file_url: null,
      file_type: null,
      file_name: null,
      reply_to_id: replyingTo?.id,
    });
    onCancelReply?.();
    setShowPlusSheet(false);
    setShowWordInput(false);
    setWordMysteryInput("");
  };

  const handlePickImage = async () => {
    setShowPlusSheet(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileName = asset.fileName || `media_${Date.now()}.${asset.type === "video" ? "mp4" : "jpg"}`;
        const mimeType = asset.type === "video" ? "video/mp4" : "image/jpeg";

        setUploadingFile(true);
        try {
          const uploaded = await uploadFile(asset.uri, fileName, mimeType);
          setPendingFile({
            url: uploaded.url,
            file_type: uploaded.file_type,
            file_name: uploaded.original_name,
          });
        } catch (err: any) {
          Alert.alert("Erreur", err.message || "Échec du téléversement.");
        }
        setUploadingFile(false);
      }
    } catch {}
  };

  const handlePickDocument = async () => {
    setShowPlusSheet(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "audio/*",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setUploadingFile(true);
        try {
          const uploaded = await uploadFile(asset.uri, asset.name, asset.mimeType || "application/octet-stream");
          setPendingFile({
            url: uploaded.url,
            file_type: uploaded.file_type,
            file_name: uploaded.original_name,
          });
        } catch (err: any) {
          Alert.alert("Erreur", err.message || "Échec du téléversement.");
        }
        setUploadingFile(false);
      }
    } catch {}
  };

  const dispatchSend = (textToSend: string, fileToSend: typeof pendingFile) => {
    const trimmed = textToSend.trim();
    if (!trimmed && !fileToSend) return;

    const finalType = msgType === "delayed" ? "normal" : msgType;
    let computedVisibleAt: string | null = null;
    if (msgType === "delayed") {
      if (delayedDate.getTime() <= Date.now()) {
        Alert.alert("Heure invalide", "Veuillez sélectionner une date/heure dans le futur.");
        return;
      }
      computedVisibleAt = delayedDate.toISOString();
    }

    if (hapticsOn) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    onSend({
      content: trimmed,
      type: finalType,
      is_anonymous: isAnonymous,
      ttl: msgType === "ephemeral" ? ephemeralTtl : null,
      visible_at: computedVisibleAt,
      file_url: fileToSend?.url || null,
      file_type: fileToSend?.file_type || null,
      file_name: fileToSend?.file_name || null,
      reply_to_id: replyingTo?.id || null,
      reply_to_sender: replyingTo?.sender_username || (replyingTo ? "Anonyme" : null),
      reply_to_content: replyingTo?.content || (replyingTo?.file_name ?? null),
    });

    setContent("");
    setPendingFile(null);

    if (user?.auto_reset_mode !== false) {
      setMsgType("normal");
      setIsAnonymous(false);
    }
  };

  const hasSpecialMode = msgType !== "normal" || isAnonymous;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {/* Reply Banner */}
      {replyingTo && (
        <View style={styles.replyBanner}>
          <Feather name="corner-up-left" size={14} color="#C5A03B" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: "#C5A03B", fontWeight: "700" }}>
              Réponse à {replyingTo.sender_username || "Anonyme"}
            </Text>
            <Text style={{ fontSize: 12, color: "#CBD5E1" }} numberOfLines={1}>
              {replyingTo.file_type === "audio"
                ? "Message vocal"
                : replyingTo.file_type
                ? replyingTo.file_name || "Pièce jointe"
                : replyingTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} style={{ padding: 4 }}>
            <Feather name="x" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      )}

      {/* Pending File / Voice Preview */}
      {pendingFile && (
        <View style={styles.filePreview}>
          <Feather
            name={
              pendingFile.file_type === "image"
                ? "image"
                : pendingFile.file_type === "video"
                ? "video"
                : pendingFile.file_type === "audio"
                ? "mic"
                : "paperclip"
            }
            size={18}
            color="#C5A03B"
          />
          {pendingFile.file_type === "audio" ? (
            <View style={{ flex: 1 }}>
              <VoicePlayer url={getUploadUrl(pendingFile.url)} />
            </View>
          ) : (
            <Text style={{ flex: 1, color: "#C5A03B", fontSize: 13 }} numberOfLines={1}>
              {pendingFile.file_name}
            </Text>
          )}
          <TouchableOpacity onPress={() => setPendingFile(null)} style={{ padding: 4 }}>
            <Feather name="x" size={16} color="#f87171" />
          </TouchableOpacity>
        </View>
      )}

      {/* Active Mode Strip */}
      {hasSpecialMode && (
        <View style={styles.modeStrip}>
          {msgType !== "normal" && (
            <View style={styles.modeChip}>
              <Feather
                name={msgType === "hidden" ? "eye" : msgType === "ephemeral" ? "clock" : "calendar"}
                size={12}
                color="#C5A03B"
              />
              <Text style={styles.modeChipText}>
                {msgType === "hidden" && "Caché"}
                {msgType === "ephemeral" && `Éphémère (${ephemeralTtl >= 3600 ? `${ephemeralTtl / 3600}h` : `${ephemeralTtl}s`})`}
                {msgType === "delayed" &&
                  `Différé (${delayedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`}
              </Text>
              <TouchableOpacity onPress={() => setMsgType("normal")}>
                <Feather name="x" size={13} color="#C5A03B" />
              </TouchableOpacity>
            </View>
          )}
          {isAnonymous && (
            <View style={[styles.modeChip, { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.08)" }]}>
              <Feather name="eye-off" size={12} color="#FFF" />
              <Text style={[styles.modeChipText, { color: "#FFF" }]}>Anonyme</Text>
              <TouchableOpacity onPress={() => setIsAnonymous(false)}>
                <Feather name="x" size={13} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Single Clean Input Row */}
      <View style={styles.inputRow}>
        <TouchableOpacity
          onPress={() => {
            setShowPlusSheet(true);
            setShowWordInput(false);
          }}
          disabled={uploadingFile || isRecording}
          style={styles.iconCircleBtn}
        >
          {uploadingFile ? <ActivityIndicator size="small" color="#C5A03B" /> : <Feather name="plus" size={20} color="#E2E8F0" />}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowModeSheet(true)}
          disabled={isRecording}
          style={[styles.iconCircleBtn, hasSpecialMode && styles.iconCircleBtnActive]}
        >
          <Feather
            name={
              msgType === "hidden"
                ? "eye"
                : msgType === "ephemeral"
                ? "clock"
                : msgType === "delayed"
                ? "calendar"
                : isAnonymous
                ? "eye-off"
                : "sliders"
            }
            size={18}
            color={hasSpecialMode ? "#C5A03B" : "#E2E8F0"}
          />
        </TouchableOpacity>

        {isRecording ? (
          <View style={styles.recordingStrip}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" }} />
              <Text style={{ color: "#f87171", fontWeight: "700", fontSize: 13 }}>{formatDuration(recordingDuration)}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity onPress={cancelRecording} style={{ padding: 4 }}>
                <Feather name="trash-2" size={18} color="#f87171" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => finishRecording(false)} style={{ padding: 4 }}>
                <Feather name="square" size={17} color="#E2E8F0" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Écrire un message..."
            placeholderTextColor="#94A3B8"
            value={content}
            onChangeText={(text) => {
              setContent(text);
              handleTyping();
            }}
            multiline
            maxLength={4000}
          />
        )}

        {isRecording ? (
          <TouchableOpacity style={styles.sendBtn} onPress={() => finishRecording(true)}>
            <Feather name="send" size={18} color="#0A1128" />
          </TouchableOpacity>
        ) : !content.trim() && !pendingFile ? (
          <TouchableOpacity style={styles.micBtn} onPress={startRecording}>
            <Feather name="mic" size={19} color="#C5A03B" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.sendBtn} onPress={() => dispatchSend(content, pendingFile)}>
            <Feather name="send" size={18} color="#0A1128" />
          </TouchableOpacity>
        )}
      </View>

      {/* Attachment & Mini-Games Sheet */}
      <Modal visible={showPlusSheet} transparent animationType="slide" onRequestClose={() => setShowPlusSheet(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowPlusSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheetBox, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {!showWordInput ? (
              <>
                <Text style={styles.sheetTitle}>Partager ou Jouer</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                  <TouchableOpacity onPress={handlePickImage} style={styles.mediaActionCard}>
                    <Feather name="image" size={22} color="#C5A03B" />
                    <Text style={styles.mediaActionText}>Photo / Vidéo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handlePickDocument} style={styles.mediaActionCard}>
                    <Feather name="file-text" size={22} color="#C5A03B" />
                    <Text style={styles.mediaActionText}>Document / Audio</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.sheetTitle, { fontSize: 13, color: "#94A3B8", marginBottom: 8 }]}>Mini-Jeux</Text>
                <View style={{ gap: 8 }}>
                  <TouchableOpacity onPress={() => startGame("game_tictactoe")} style={styles.gameRowBtn}>
                    <Feather name="grid" size={18} color="#C5A03B" />
                    <Text style={styles.gameRowText}>Morpion</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => startGame("game_connect4")} style={styles.gameRowBtn}>
                    <Feather name="disc" size={18} color="#C5A03B" />
                    <Text style={styles.gameRowText}>Puissance 4</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => startGame("game_rps")} style={styles.gameRowBtn}>
                    <Feather name="scissors" size={18} color="#C5A03B" />
                    <Text style={styles.gameRowText}>Pierre-Papier-Ciseaux</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowWordInput(true)} style={styles.gameRowBtn}>
                    <Feather name="help-circle" size={18} color="#C5A03B" />
                    <Text style={styles.gameRowText}>Le Mot Mystère</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={styles.sheetTitle}>Le Mot Mystère</Text>
                <Text style={{ color: "#94A3B8", fontSize: 13 }}>Choisissez un mot à faire deviner :</Text>
                <TextInput
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: "#FFF",
                    borderRadius: 10,
                    padding: 13,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                  }}
                  placeholder="EX: SILENCE"
                  placeholderTextColor="#64748B"
                  value={wordMysteryInput}
                  onChangeText={(t) => setWordMysteryInput(t.toUpperCase())}
                  autoCapitalize="characters"
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setShowWordInput(false)}
                    style={{ flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center" }}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "600" }}>Retour</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => startGame("game_word_mystery")}
                    disabled={!wordMysteryInput.trim()}
                    style={{
                      flex: 1,
                      padding: 13,
                      borderRadius: 10,
                      backgroundColor: wordMysteryInput.trim() ? "#C5A03B" : "rgba(255,255,255,0.15)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#0A1128", fontWeight: "700" }}>Lancer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Send Mode Sheet */}
      <Modal visible={showModeSheet} transparent animationType="slide" onRequestClose={() => setShowModeSheet(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowModeSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheetBox, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>Mode d&apos;envoi</Text>
              <TouchableOpacity onPress={() => setShowModeSheet(false)}>
                <Feather name="check" size={20} color="#C5A03B" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {[
                { id: "normal", label: "Standard", icon: "message-square" as const },
                { id: "hidden", label: "Caché", icon: "eye" as const },
                { id: "ephemeral", label: "Éphémère", icon: "clock" as const },
                { id: "delayed", label: "Différé", icon: "calendar" as const },
              ].map((m) => {
                const active = msgType === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setMsgType(m.id as any)}
                    style={[styles.modeOptionBtn, active && styles.modeOptionBtnActive]}
                  >
                    <Feather name={m.icon} size={15} color={active ? "#0A1128" : "#C5A03B"} />
                    <Text style={[styles.modeOptionText, active && { color: "#0A1128", fontWeight: "700" }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {msgType === "ephemeral" && (
              <View style={{ marginBottom: 14, gap: 8 }}>
                <Text style={{ color: "#94A3B8", fontSize: 12 }}>Durée après ouverture par le destinataire :</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {[
                    { v: 5, l: "5s" },
                    { v: 10, l: "10s" },
                    { v: 30, l: "30s" },
                    { v: 60, l: "1m" },
                    { v: 3600, l: "1h" },
                    { v: 86400, l: "24h" },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.v}
                      onPress={() => setEphemeralTtl(opt.v)}
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
                        ephemeralTtl === opt.v && { borderColor: "#C5A03B", backgroundColor: "rgba(197,160,59,0.2)" },
                      ]}
                    >
                      <Text style={{ color: ephemeralTtl === opt.v ? "#C5A03B" : "#94A3B8", fontSize: 12, fontWeight: "600" }}>
                        {opt.l}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {msgType === "delayed" && (
              <View style={{ marginBottom: 14, gap: 10 }}>
                <Text style={{ color: "#94A3B8", fontSize: 12 }}>Préréglages rapides :</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity onPress={() => applyDelayPreset("1h")} style={styles.presetBtn}>
                    <Text style={styles.presetText}>+1 heure</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => applyDelayPreset("tonight")} style={styles.presetBtn}>
                    <Text style={styles.presetText}>Ce soir 20h</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => applyDelayPreset("tomorrow")} style={styles.presetBtn}>
                    <Text style={styles.presetText}>Demain 08h</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setPickerMode("date");
                      setShowPicker(true);
                    }}
                    style={[styles.presetBtn, { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 }]}
                  >
                    <Feather name="calendar" size={14} color="#C5A03B" />
                    <Text style={{ color: "#C5A03B", fontSize: 13 }}>{delayedDate.toLocaleDateString()}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setPickerMode("time");
                      setShowPicker(true);
                    }}
                    style={[styles.presetBtn, { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 }]}
                  >
                    <Feather name="clock" size={14} color="#C5A03B" />
                    <Text style={{ color: "#C5A03B", fontSize: 13 }}>
                      {delayedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showPicker && (
                  <DateTimePicker
                    value={delayedDate}
                    mode={pickerMode}
                    is24Hour={true}
                    display="default"
                    onChange={(_event: any, selectedDate?: Date) => {
                      setShowPicker(Platform.OS === "ios");
                      if (selectedDate) setDelayedDate(selectedDate);
                    }}
                  />
                )}
              </View>
            )}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 12,
                borderTopWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="eye-off" size={16} color="#C5A03B" />
                <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "500" }}>Masquer mon identité (Anonyme)</Text>
              </View>
              <Switch
                value={isAnonymous}
                onValueChange={setIsAnonymous}
                trackColor={{ false: "rgba(255,255,255,0.15)", true: "rgba(197,160,59,0.55)" }}
                thumbColor={isAnonymous ? "#C5A03B" : "#94A3B8"}
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: "#0E1834",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#C5A03B",
    marginBottom: 8,
  },
  filePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: "rgba(197,160,59,0.1)",
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.3)",
    borderRadius: 10,
  },
  modeStrip: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: "rgba(197,160,59,0.15)",
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.4)",
  },
  modeChipText: { color: "#C5A03B", fontSize: 11, fontWeight: "600" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  iconCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircleBtnActive: {
    borderColor: "#C5A03B",
    backgroundColor: "rgba(197,160,59,0.16)",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    color: "#FFF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  recordingStrip: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sendBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#C5A03B",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.5)",
    backgroundColor: "rgba(197,160,59,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(5,9,22,0.72)", justifyContent: "flex-end" },
  sheetBox: {
    backgroundColor: "#0E1834",
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "rgba(197,160,59,0.3)",
  },
  sheetTitle: { color: "#C5A03B", fontSize: 17, fontWeight: "700", marginBottom: 14 },
  mediaActionCard: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    gap: 8,
  },
  mediaActionText: { color: "#FFF", fontSize: 13, fontWeight: "600" },
  gameRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  gameRowText: { color: "#FFF", fontSize: 15, fontWeight: "500" },
  modeOptionBtn: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modeOptionBtnActive: { backgroundColor: "#C5A03B", borderColor: "#C5A03B" },
  modeOptionText: { color: "#FFF", fontSize: 13, fontWeight: "600" },
  presetBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  presetText: { color: "#E2E8F0", fontSize: 12, fontWeight: "500" },
});
