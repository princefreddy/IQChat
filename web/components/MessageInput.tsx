"use client"
import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadFile } from '@/lib/api';
import { useToast } from './ToastProvider';

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

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count (mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Write samples
  let index = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    index += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

export default function MessageInput({ onSend, onTyping, replyingTo, onCancelReply }: { onSend: (data: any) => void; onTyping?: (isTyping: boolean) => void; replyingTo?: any; onCancelReply?: () => void }) {
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [msgType, setMsgType] = useState('normal');
  const [ephemeralTtl, setEphemeralTtl] = useState(10);
  const [delayDate, setDelayDate] = useState(() => {
     const d = new Date(); d.setDate(d.getDate() + 1);
     return d.toISOString().slice(0, 10);
  });
  const [delayTime, setDelayTime] = useState('12:00');
  
  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; file_type: string; file_name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Typing indicator debounce
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const { showToast } = useToast();

  // Game menu state
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [wordMysteryInput, setWordMysteryInput] = useState('');
  const [showWordInput, setShowWordInput] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingDataRef = useRef<{ leftChannel: Float32Array[]; recordingLength: number }>({ leftChannel: [], recordingLength: 0 });
  const sampleRateRef = useRef<number>(44100);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      // Create a ScriptProcessorNode with buffer size 4096, 1 input channel, 1 output channel
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
      timerRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      showToast("Impossible d'accéder au microphone", 'error');
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    // Disconnect and clean up Audio Nodes
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    const { leftChannel, recordingLength } = recordingDataRef.current;
    if (recordingLength === 0) {
      showToast("Aucun audio enregistré", 'error');
      return;
    }

    setUploadingFile(true);
    try {
      const sampleRate = sampleRateRef.current;
      const mergedSamples = mergeBuffers(leftChannel, recordingLength);
      const wavBlob = encodeWAV(mergedSamples, sampleRate);
      const file = new File([wavBlob], "voice_message.wav", { type: 'audio/wav' });

      const result = await uploadFile(file);
      setPendingFile({
        url: result.url,
        file_type: 'audio',
        file_name: 'voice_message.wav',
      });
      if (!content.trim()) setContent('🎤 Message vocal');
    } catch (err: any) {
      showToast(err.message || "Erreur d'upload vocal", 'error');
    }
    setUploadingFile(false);
  };

  const cancelRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);

      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
        processorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      recordingDataRef.current = { leftChannel: [], recordingLength: 0 };
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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

  const startGame = (type: string, extraData: any = {}) => {
    let contentObj: any = {
      player_x: null,
      player_o: null,
      winner: null,
      status: "playing"
    };

    if (type === 'game_tictactoe') {
      contentObj.board = ["", "", "", "", "", "", "", "", ""];
      contentObj.current_turn = "x";
    } else if (type === 'game_connect4') {
      contentObj.board = Array(42).fill(""); // 7 cols x 6 rows
      contentObj.current_turn = "x";
    } else if (type === 'game_rps') {
      contentObj.player_x_choice = null;
      contentObj.player_o_choice = null;
    } else if (type === 'game_word_mystery') {
      if (!wordMysteryInput.trim()) return;
      contentObj.target_word = wordMysteryInput.toUpperCase();
      contentObj.guesses = [];
    }

    onSend({
      content: JSON.stringify({ ...contentObj, ...extraData }),
      type: type,
      is_anonymous: false,
      ttl: null,
      visible_at: null,
      file_url: null,
      file_type: null,
      file_name: null,
      reply_to_id: replyingTo?.id,
    });
    if (onCancelReply) onCancelReply();
    setShowGameMenu(false);
    setShowWordInput(false);
    setWordMysteryInput('');
  };

  const toggleGameMenu = () => {
    setShowGameMenu(!showGameMenu);
    setShowWordInput(false);
  };

  // Clean up typing on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current && onTyping) onTyping(false);
    };
  }, [onTyping]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      showToast('Fichier trop volumineux (max 10 MB)', 'error');
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
      showToast(`📎 ${result.original_name} prêt à envoyer`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Erreur d\'upload', 'error');
    }
    setUploadingFile(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !pendingFile) return;

    let finalType = msgType === 'delayed' ? 'normal' : msgType;

    onSend({
      content: content || (pendingFile ? `📎 ${pendingFile.file_name}` : ''),
      type: finalType,
      is_anonymous: isAnonymous,
      ttl: msgType === 'ephemeral' ? ephemeralTtl : null,
      visible_at: msgType === 'delayed' && delayDate && delayTime ? new Date(`${delayDate}T${delayTime}:00`).toISOString() : null,
      file_url: pendingFile?.url || null,
      file_type: pendingFile?.file_type || null,
      file_name: pendingFile?.file_name || null,
      reply_to_id: replyingTo?.id,
    });
    
    setContent('');
    setPendingFile(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-glass)',
      borderTop: '1px solid var(--border-glass)',
      padding: '16px',
      borderBottomLeftRadius: '24px',
      borderBottomRightRadius: '24px'
    }}>
      {/* Replying To Banner */}
      {replyingTo && (
        <div className="animate-slide-up" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 12px',
          marginBottom: '12px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderLeft: '4px solid var(--accent-gold)',
          borderRadius: '8px',
        }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>Réponse à {replyingTo.sender_username || "Anonyme"}</span>
            <span style={{ fontSize: '13px', color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {replyingTo.file_type === 'audio' ? '🎤 Message vocal' : replyingTo.file_type ? '📎 Pièce jointe' : replyingTo.content}
            </span>
          </div>
          <button onClick={onCancelReply} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: '14px' }}>✕</button>
        </div>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <div className="animate-slide-up" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 12px',
          marginBottom: '12px',
          background: 'rgba(212, 175, 55, 0.1)',
          border: '1px solid rgba(212, 175, 55, 0.3)',
          borderRadius: '8px',
        }}>
          <span style={{ fontSize: '20px' }}>
            {pendingFile.file_type === 'image' ? '🖼️' : pendingFile.file_type === 'video' ? '🎬' : pendingFile.file_type === 'audio' ? '🎵' : '📎'}
          </span>
          <span style={{ flex: 1, color: 'var(--accent-gold)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pendingFile.file_name}
          </span>
          <button 
            onClick={() => setPendingFile(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: '14px', padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Toggles */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', alignItems: 'center' }}>
        <button 
          type="button"
          onClick={() => setMsgType('normal')}
          className={`btn-alt ${msgType === 'normal' ? 'active' : ''}`}
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          Normal
        </button>
        <button 
          type="button"
          onClick={() => setMsgType('hidden')}
          className={`btn-alt ${msgType === 'hidden' ? 'active' : ''}`}
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          👀 Caché
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button 
            type="button"
            onClick={() => setMsgType('ephemeral')}
            className={`btn-alt ${msgType === 'ephemeral' ? 'active' : ''}`}
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            ⏳ Éphémère
          </button>
          {msgType === 'ephemeral' && (
             <select 
               value={ephemeralTtl} 
               onChange={(e) => setEphemeralTtl(Number(e.target.value))}
               style={{ background: 'var(--bg-primary)', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', borderRadius: '8px', padding: '4px 8px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
             >
               <option value={5}>5s</option>
               <option value={10}>10s</option>
               <option value={3600}>1h</option>
               <option value={7200}>2h</option>
               <option value={86400}>24h</option>
             </select>
          )}
          <button 
            type="button"
            onClick={() => setMsgType('delayed')}
            className={`btn-alt ${msgType === 'delayed' ? 'active' : ''}`}
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            ⏰ Différé
          </button>
          {msgType === 'delayed' && (
             <div style={{ display: 'flex', gap: '4px' }}>
               <input 
                 type="date" 
                 value={delayDate} 
                 onChange={(e) => setDelayDate(e.target.value)}
                 style={{ background: 'var(--bg-primary)', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', borderRadius: '8px', padding: '4px 8px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
               />
               <input 
                 type="time" 
                 value={delayTime} 
                 onChange={(e) => setDelayTime(e.target.value)}
                 style={{ background: 'var(--bg-primary)', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', borderRadius: '8px', padding: '4px 8px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
               />
             </div>
          )}
        </div>
        
        <div style={{ borderLeft: '1px solid var(--border-glass)', height: '24px', margin: '0 4px' }}></div>
        
        <button 
           type="button"
           onClick={() => setIsAnonymous(!isAnonymous)}
           className={`btn-alt ${isAnonymous ? 'active' : ''}`}
           style={{ padding: '6px 12px', fontSize: '12px' }}
        >
           {isAnonymous ? '👤 Anonyme ON' : '👤 Anonyme OFF'}
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {/* File upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-glass)',
            borderRadius: '12px',
            padding: '10px 14px',
            cursor: uploadingFile ? 'wait' : 'pointer',
            fontSize: '18px',
            transition: 'all 0.2s',
            color: pendingFile ? 'var(--accent-gold)' : 'white',
            opacity: uploadingFile ? 0.5 : 1,
          }}
          title="Joindre un fichier"
        >
          {uploadingFile ? '⏳' : '📎'}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={toggleGameMenu}
            style={{
              background: 'transparent',
              border: '1px solid var(--accent-gold)',
              borderRadius: '12px',
              padding: '10px 14px',
              cursor: 'pointer',
              fontSize: '18px',
              transition: 'all 0.2s',
            }}
            title="Catalogue de Jeux"
          >
            🎮
          </button>
          
          {showGameMenu && (
            <div style={{
              position: 'absolute',
              bottom: '50px',
              left: 0,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '16px',
              padding: '12px',
              width: '240px',
              zIndex: 100,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', marginBottom: '4px' }}>Catalogue de Mini-Jeux</div>
              
              {!showWordInput ? (
                <>
                  <button type="button" onClick={() => startGame('game_tictactoe')} className="game-menu-btn">
                    🎮 Morpion
                  </button>
                  <button type="button" onClick={() => startGame('game_connect4')} className="game-menu-btn">
                    🔴🟡 Puissance 4
                  </button>
                  <button type="button" onClick={() => startGame('game_rps')} className="game-menu-btn">
                    ✂️📄 Pierre-Papier-Ciseaux
                  </button>
                  <button type="button" onClick={() => setShowWordInput(true)} className="game-menu-btn">
                    🧠 Le Mot Mystère
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Choisissez un mot à faire deviner :</div>
                  <input 
                    type="text" 
                    value={wordMysteryInput}
                    onChange={(e) => setWordMysteryInput(e.target.value.toUpperCase())}
                    placeholder="BATEAU"
                    style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '6px', color: 'white', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="button" onClick={() => setShowWordInput(false)} style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'transparent', color: 'white', cursor: 'pointer' }}>Annuler</button>
                    <button type="button" onClick={() => startGame('game_word_mystery')} disabled={!wordMysteryInput.trim()} style={{ flex: 1, padding: '6px', borderRadius: '8px', border: 'none', background: 'var(--accent-gold)', color: 'black', fontWeight: 'bold', cursor: 'pointer', opacity: wordMysteryInput.trim() ? 1 : 0.5 }}>Lancer</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <input
          className="input-royal"
          placeholder={isRecording ? `Enregistrement... ${formatDuration(recordingDuration)}` : "Écrivez un message... (Ctrl+Enter pour envoyer)"}
          value={content}
          onChange={(e) => { setContent(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
          style={{ flex: 1 }}
          disabled={isRecording}
        />

        {isRecording ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={cancelRecording} style={{ background: 'transparent', border: '1px solid #ff4d4f', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer', fontSize: '18px', color: '#ff4d4f' }} title="Annuler">🗑️</button>
            <button type="button" onClick={stopRecording} style={{ background: 'var(--accent-gold-gradient)', border: 'none', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer', fontSize: '18px', color: 'black' }} title="Arrêter l'enregistrement">⏹️ Stop</button>
          </div>
        ) : (
          <>
            {!content.trim() && !pendingFile ? (
              <button
                type="button"
                onClick={startRecording}
                style={{ background: 'transparent', border: '1px solid var(--accent-gold)', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer', fontSize: '18px', color: 'var(--accent-gold)' }}
                title="Enregistrer un vocal"
              >
                🎤
              </button>
            ) : (
              <button type="submit" className="btn-royal">
                Envoyer 🚀
              </button>
            )}
          </>
        )}
      </form>
    </div>
  );
}
