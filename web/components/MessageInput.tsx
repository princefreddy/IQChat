"use client";
import { useState, useRef, useEffect } from "react";
import { uploadFile, getUploadUrl } from "@/lib/api";
import { useToast } from "./ToastProvider";
import Icon, { type IconName } from "./Icon";

function mergeBuffers(channelBuffer: Float32Array[], recordingLength: number): Float32Array {
  const result = new Float32Array(recordingLength);
  let offset = 0;
  for (let i = 0; i < channelBuffer.length; i++) {
    const buffer = channelBuffer[i];
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (v: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let index = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    index += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

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
  const [content, setContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [msgType, setMsgType] = useState<"normal" | "hidden" | "ephemeral" | "delayed">("normal");
  const [ephemeralTtl, setEphemeralTtl] = useState<number>(user?.default_ephemeral_ttl || 10);
  const [delayDate, setDelayDate] = useState(() => {
    const d = new Date(Date.now() + 3600 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [delayTime, setDelayTime] = useState(() => {
    const d = new Date(Date.now() + 3600 * 1000);
    return d.toTimeString().slice(0, 5);
  });

  useEffect(() => {
    if (user?.default_ephemeral_ttl) {
      setEphemeralTtl(user.default_ephemeral_ttl);
    }
  }, [user?.default_ephemeral_ttl]);

  // Apply external quiet-hours schedule preset
  useEffect(() => {
    if (externalDelayedUntil) {
      const target = new Date(externalDelayedUntil);
      if (!isNaN(target.getTime())) {
        const yyyy = target.getFullYear();
        const mm = String(target.getMonth() + 1).padStart(2, "0");
        const dd = String(target.getDate()).padStart(2, "0");
        const hh = String(target.getHours()).padStart(2, "0");
        const min = String(target.getMinutes()).padStart(2, "0");
        setDelayDate(`${yyyy}-${mm}-${dd}`);
        setDelayTime(`${hh}:${min}`);
        setMsgType("delayed");
      }
      onClearExternalDelay?.();
    }
  }, [externalDelayedUntil, onClearExternalDelay]);

  // Popovers
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [wordMysteryInput, setWordMysteryInput] = useState("");
  const [showWordInput, setShowWordInput] = useState(false);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; file_type: string; file_name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Typing debounce
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const { showToast } = useToast();

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingDataRef = useRef<{ leftChannel: Float32Array[]; recordingLength: number }>({
    leftChannel: [],
    recordingLength: 0,
  });
  const sampleRateRef = useRef<number>(44100);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current && onTyping) onTyping(false);
    };
  }, [onTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [content]);

  const applyDelayPreset = (preset: "1h" | "tonight" | "tomorrow") => {
    const now = new Date();
    const target = new Date(now);
    if (preset === "1h") {
      target.setHours(target.getHours() + 1);
    } else if (preset === "tonight") {
      target.setHours(20, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
    } else if (preset === "tomorrow") {
      target.setDate(target.getDate() + 1);
      target.setHours(8, 0, 0, 0);
    }
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    const hh = String(target.getHours()).padStart(2, "0");
    const min = String(target.getMinutes()).padStart(2, "0");
    setDelayDate(`${yyyy}-${mm}-${dd}`);
    setDelayTime(`${hh}:${min}`);
    setMsgType("delayed");
  };

  const cleanupAudioGraph = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== "closed") {
        await audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      recordingDataRef.current = { leftChannel: [], recordingLength: 0 };
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        recordingDataRef.current.leftChannel.push(new Float32Array(inputData));
        recordingDataRef.current.recordingLength += inputData.length;
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration((prev) => prev + 1), 1000);
    } catch {
      showToast("Impossible d'accéder au microphone", "error");
    }
  };

  const finishRecording = async (sendImmediately: boolean) => {
    if (!isRecording) return;
    setIsRecording(false);
    await cleanupAudioGraph();

    const { leftChannel, recordingLength } = recordingDataRef.current;
    if (recordingLength === 0) {
      showToast("Aucun son détecté", "warning");
      return;
    }

    setUploadingFile(true);
    try {
      const mergedSamples = mergeBuffers(leftChannel, recordingLength);
      const wavBlob = encodeWAV(mergedSamples, sampleRateRef.current);
      const file = new File([wavBlob], "message_vocal.wav", { type: "audio/wav" });
      const result = await uploadFile(file);

      const voiceAttachment = {
        url: result.url,
        file_type: "audio",
        file_name: "Message vocal",
      };

      if (sendImmediately) {
        dispatchSend("", voiceAttachment);
      } else {
        setPendingFile(voiceAttachment);
      }
    } catch (err: any) {
      showToast(err.message || "Erreur lors de l'envoi vocal", "error");
    }
    setUploadingFile(false);
  };

  const cancelRecording = async () => {
    setIsRecording(false);
    await cleanupAudioGraph();
    recordingDataRef.current = { leftChannel: [], recordingLength: 0 };
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleTyping = () => {
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
  };

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
    setShowPlusMenu(false);
    setShowWordInput(false);
    setWordMysteryInput("");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowPlusMenu(false);

    if (file.size > 10 * 1024 * 1024) {
      showToast("Fichier trop volumineux (max 10 Mo)", "error");
      return;
    }

    setUploadingFile(true);
    try {
      const result = await uploadFile(file);
      setPendingFile({
        url: result.url,
        file_type: result.file_type,
        file_name: result.original_name,
      });
    } catch (err: any) {
      showToast(err.message || "Erreur d'upload", "error");
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const dispatchSend = (textToSend: string, fileToSend: typeof pendingFile) => {
    const trimmed = textToSend.trim();
    if (!trimmed && !fileToSend) return;

    const finalType = msgType === "delayed" ? "normal" : msgType;
    let computedVisibleAt: string | null = null;
    if (msgType === "delayed" && delayDate && delayTime) {
      const parsed = new Date(`${delayDate}T${delayTime}:00`);
      if (parsed.getTime() <= Date.now()) {
        showToast("Choisissez une heure future pour un envoi différé", "warning");
        return;
      }
      computedVisibleAt = parsed.toISOString();
    }

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
    setShowModeMenu(false);

    if (user?.auto_reset_mode !== false) {
      setMsgType("normal");
      setIsAnonymous(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatchSend(content, pendingFile);
  };

  const enterSends = user?.enter_to_send !== false;
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (enterSends) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        dispatchSend(content, pendingFile);
      }
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      dispatchSend(content, pendingFile);
    }
  };

  const hasSpecialMode = msgType !== "normal" || isAnonymous;

  const getFileIcon = (ft: string): IconName => {
    if (ft === "image") return "image";
    if (ft === "video") return "video";
    if (ft === "audio") return "mic";
    return "paperclip";
  };

  return (
    <div
      style={{
        background: "var(--bg-glass)",
        borderTop: "1px solid var(--border-glass)",
        padding: "12px 16px",
        position: "relative",
      }}
    >
      {/* Reply Banner */}
      {replyingTo && (
        <div
          className="animate-slide-up"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 12px",
            marginBottom: "10px",
            background: "rgba(255, 255, 255, 0.04)",
            borderLeft: "3px solid var(--accent-gold)",
            borderRadius: "8px",
          }}
        >
          <Icon name="reply" size={14} color="var(--accent-gold)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", color: "var(--accent-gold)", fontWeight: 600 }}>
              Réponse à {replyingTo.sender_username || "Anonyme"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {replyingTo.file_type === "audio"
                ? "Message vocal"
                : replyingTo.file_type
                ? replyingTo.file_name || "Pièce jointe"
                : replyingTo.content}
            </div>
          </div>
          <button type="button" className="icon-btn" style={{ width: "26px", height: "26px", border: "none" }} onClick={onCancelReply}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Pending File / Voice Preview */}
      {pendingFile && (
        <div
          className="animate-slide-up"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 12px",
            marginBottom: "10px",
            background: "rgba(197, 160, 59, 0.1)",
            border: "1px solid rgba(197, 160, 59, 0.3)",
            borderRadius: "10px",
          }}
        >
          <Icon name={getFileIcon(pendingFile.file_type)} size={18} color="var(--accent-gold)" />
          {pendingFile.file_type === "audio" ? (
            <audio src={getUploadUrl(pendingFile.url)} controls style={{ height: "32px", flex: 1 }} />
          ) : (
            <span
              style={{
                flex: 1,
                color: "var(--accent-gold)",
                fontSize: "13px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {pendingFile.file_name}
            </span>
          )}
          <button
            type="button"
            className="icon-btn danger"
            style={{ width: "28px", height: "28px", border: "none" }}
            onClick={() => setPendingFile(null)}
            title="Retirer"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Active Special Mode Pill Strip */}
      {hasSpecialMode && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          {msgType !== "normal" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "20px",
                background: "rgba(197, 160, 59, 0.15)",
                border: "1px solid rgba(197, 160, 59, 0.4)",
                color: "var(--accent-gold)",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              <Icon
                name={msgType === "hidden" ? "eye" : msgType === "ephemeral" ? "hourglass" : "clock"}
                size={12}
                color="var(--accent-gold)"
              />
              <span>
                {msgType === "hidden" && "Mode caché"}
                {msgType === "ephemeral" && `Éphémère (${ephemeralTtl >= 3600 ? `${ephemeralTtl / 3600}h` : `${ephemeralTtl}s`})`}
                {msgType === "delayed" && `Différé (${delayDate} à ${delayTime})`}
              </span>
              <button
                type="button"
                onClick={() => setMsgType("normal")}
                style={{ background: "transparent", border: "none", color: "var(--accent-gold)", cursor: "pointer", padding: 0, display: "flex" }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          )}

          {isAnonymous && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "20px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid var(--border-glass)",
                color: "white",
                fontSize: "12px",
              }}
            >
              <Icon name="eye-off" size={12} color="var(--accent-gold)" />
              <span>Envoi anonyme</span>
              <button
                type="button"
                onClick={() => setIsAnonymous(false)}
                style={{ background: "transparent", border: "none", color: "white", cursor: "pointer", padding: 0, display: "flex" }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Main Single-Row Composer */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {/* [ + ] Attachment & Mini-Games Popover */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className={`icon-btn ${showPlusMenu ? "active" : ""}`}
            style={{ width: "42px", height: "42px", borderRadius: "12px" }}
            onClick={() => {
              setShowPlusMenu((v) => !v);
              setShowModeMenu(false);
              setShowWordInput(false);
            }}
            disabled={uploadingFile || isRecording}
            title="Joindre un fichier ou lancer un mini-jeu"
          >
            <Icon name={uploadingFile ? "clock" : "plus"} size={19} />
          </button>

          {showPlusMenu && (
            <div
              className="animate-slide-up"
              style={{
                position: "absolute",
                bottom: "52px",
                left: 0,
                background: "#0E1834",
                border: "1px solid rgba(197, 160, 59, 0.3)",
                borderRadius: "14px",
                padding: "10px",
                width: "240px",
                zIndex: 100,
                boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {!showWordInput ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="game-menu-btn"
                  >
                    <Icon name="paperclip" size={16} color="var(--accent-gold)" />
                    <span>Joindre un fichier / média</span>
                  </button>

                  <div style={{ borderTop: "1px solid var(--border-glass)", margin: "4px 0" }} />
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", padding: "0 6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                    Mini-Jeux
                  </div>

                  <button type="button" onClick={() => startGame("game_tictactoe")} className="game-menu-btn">
                    <Icon name="grid" size={16} color="var(--accent-gold)" />
                    <span>Morpion</span>
                  </button>
                  <button type="button" onClick={() => startGame("game_connect4")} className="game-menu-btn">
                    <Icon name="disc" size={16} color="var(--accent-gold)" />
                    <span>Puissance 4</span>
                  </button>
                  <button type="button" onClick={() => startGame("game_rps")} className="game-menu-btn">
                    <Icon name="scissors" size={16} color="var(--accent-gold)" />
                    <span>Pierre-Papier-Ciseaux</span>
                  </button>
                  <button type="button" onClick={() => setShowWordInput(true)} className="game-menu-btn">
                    <Icon name="help-circle" size={16} color="var(--accent-gold)" />
                    <span>Le Mot Mystère</span>
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Mot à faire deviner :</div>
                  <input
                    type="text"
                    value={wordMysteryInput}
                    onChange={(e) => setWordMysteryInput(e.target.value.toUpperCase())}
                    placeholder="EX: SILENCE"
                    autoFocus
                    className="input-royal"
                    style={{ padding: "8px 10px", fontSize: "13px" }}
                  />
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setShowWordInput(false)}
                      className="btn-alt"
                      style={{ flex: 1, padding: "7px", fontSize: "12px" }}
                    >
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={() => startGame("game_word_mystery")}
                      disabled={!wordMysteryInput.trim()}
                      className="btn-royal"
                      style={{ flex: 1, padding: "7px", fontSize: "12px" }}
                    >
                      Lancer
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mode Popover Button */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className={`icon-btn ${hasSpecialMode || showModeMenu ? "active" : ""}`}
            style={{ width: "42px", height: "42px", borderRadius: "12px" }}
            onClick={() => {
              setShowModeMenu((v) => !v);
              setShowPlusMenu(false);
            }}
            disabled={isRecording}
            title="Options Slow Communication (Caché, Éphémère, Différé, Anonyme)"
          >
            <Icon
              name={
                msgType === "hidden"
                  ? "eye"
                  : msgType === "ephemeral"
                  ? "hourglass"
                  : msgType === "delayed"
                  ? "clock"
                  : isAnonymous
                  ? "eye-off"
                  : "sliders"
              }
              size={18}
            />
          </button>

          {showModeMenu && (
            <div
              className="animate-slide-up"
              style={{
                position: "absolute",
                bottom: "52px",
                left: 0,
                background: "#0E1834",
                border: "1px solid rgba(197, 160, 59, 0.3)",
                borderRadius: "14px",
                padding: "14px",
                width: "290px",
                zIndex: 100,
                boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-gold)" }}>Mode d&apos;envoi</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {[
                  { id: "normal", label: "Standard", icon: "message-square" as const },
                  { id: "hidden", label: "Caché", icon: "eye" as const },
                  { id: "ephemeral", label: "Éphémère", icon: "hourglass" as const },
                  { id: "delayed", label: "Différé", icon: "clock" as const },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMsgType(m.id as any)}
                    className={`btn-alt ${msgType === m.id ? "active" : ""}`}
                    style={{
                      padding: "8px 10px",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={m.icon} size={14} />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>

              {msgType === "ephemeral" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Durée après lecture :</span>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {[
                      { v: 5, l: "5s" },
                      { v: 10, l: "10s" },
                      { v: 30, l: "30s" },
                      { v: 60, l: "1m" },
                      { v: 3600, l: "1h" },
                      { v: 86400, l: "24h" },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setEphemeralTtl(opt.v)}
                        className={`btn-alt ${ephemeralTtl === opt.v ? "active" : ""}`}
                        style={{ padding: "4px 8px", fontSize: "11px", flex: 1 }}
                      >
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgType === "delayed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Préréglages rapides :</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button type="button" className="btn-alt" style={{ flex: 1, padding: "5px", fontSize: "11px" }} onClick={() => applyDelayPreset("1h")}>
                      +1h
                    </button>
                    <button type="button" className="btn-alt" style={{ flex: 1, padding: "5px", fontSize: "11px" }} onClick={() => applyDelayPreset("tonight")}>
                      20h00
                    </button>
                    <button type="button" className="btn-alt" style={{ flex: 1, padding: "5px", fontSize: "11px" }} onClick={() => applyDelayPreset("tomorrow")}>
                      Demain 8h
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="date"
                      value={delayDate}
                      onChange={(e) => setDelayDate(e.target.value)}
                      className="input-royal"
                      style={{ padding: "6px 8px", fontSize: "12px", flex: 1.2 }}
                    />
                    <input
                      type="time"
                      value={delayTime}
                      onChange={(e) => setDelayTime(e.target.value)}
                      className="input-royal"
                      style={{ padding: "6px 8px", fontSize: "12px", flex: 0.9 }}
                    />
                  </div>
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid var(--border-glass)",
                  paddingTop: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "white" }}>
                  <Icon name="eye-off" size={14} color="var(--accent-gold)" />
                  <span>Masquer mon identité</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAnonymous((v) => !v)}
                  className={`royal-switch ${isAnonymous ? "on" : ""}`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Center Input or Active Voice Recording Strip */}
        {isRecording ? (
          <div
            style={{
              flex: 1,
              height: "42px",
              borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              padding: "0 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f87171", fontSize: "13px", fontWeight: 600 }}>
              <span
                className="skeleton-pulse"
                style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }}
              />
              <span>Enregistrement {formatDuration(recordingDuration)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="icon-btn danger"
                style={{ width: "30px", height: "30px", border: "none" }}
                onClick={cancelRecording}
                title="Annuler"
              >
                <Icon name="trash" size={15} />
              </button>
              <button
                type="button"
                className="icon-btn"
                style={{ width: "30px", height: "30px" }}
                onClick={() => finishRecording(false)}
                title="Arrêter et pré-écouter"
              >
                <Icon name="stop" size={13} />
              </button>
            </div>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            rows={1}
            className="input-royal"
            placeholder={enterSends ? "Écrire un message..." : "Écrire un message... (Ctrl+Entrée pour envoyer)"}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              resize: "none",
              minHeight: "42px",
              maxHeight: "120px",
              padding: "10px 14px",
              lineHeight: "20px",
              borderRadius: "12px",
            }}
          />
        )}

        {/* Right Action Button: Mic vs Direct Send */}
        {isRecording ? (
          <button
            type="button"
            onClick={() => finishRecording(true)}
            className="btn-royal"
            style={{
              height: "42px",
              padding: "0 16px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Envoyer le vocal immédiatement"
          >
            <Icon name="send" size={17} color="#0A1128" />
          </button>
        ) : !content.trim() && !pendingFile ? (
          <button
            type="button"
            onClick={startRecording}
            className="icon-btn"
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              borderColor: "rgba(197, 160, 59, 0.45)",
              color: "var(--accent-gold)",
            }}
            title="Enregistrer un message vocal"
          >
            <Icon name="mic" size={18} />
          </button>
        ) : (
          <button
            type="submit"
            className="btn-royal"
            style={{
              height: "42px",
              padding: "0 16px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Envoyer"
          >
            <Icon name="send" size={17} color="#0A1128" />
          </button>
        )}
      </form>
    </div>
  );
}
