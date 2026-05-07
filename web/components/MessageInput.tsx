"use client"
import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadFile } from '@/lib/api';
import { useToast } from './ToastProvider';

export default function MessageInput({ onSend, onTyping }: { onSend: (data: any) => void; onTyping?: (isTyping: boolean) => void }) {
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
    }, 3000);
  }, [onTyping]);

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

        <input
          className="input-royal"
          placeholder="Écrivez un message... (Ctrl+Enter pour envoyer)"
          value={content}
          onChange={(e) => { setContent(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn-royal" disabled={!content.trim() && !pendingFile}>
          Envoyer 🚀
        </button>
      </form>
    </div>
  );
}
