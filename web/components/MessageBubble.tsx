"use client"
import { useState, useEffect } from 'react';
import { getUploadUrl, BASE_URL, apiFetch } from '@/lib/api';

import TicTacToe from './games/TicTacToe';
import Connect4 from './games/Connect4';
import RockPaperScissors from './games/RockPaperScissors';
import WordMystery from './games/WordMystery';

export default function MessageBubble({ message, isOwn, currentUserId, onReaction, onReply }: any) {
  const [isRevealed, setIsRevealed] = useState(false);
  
  const getInitialTimeLeft = () => {
    if (message.type === 'ephemeral' && message.expires_at) {
      const expiresAt = new Date(message.expires_at.endsWith('Z') ? message.expires_at : message.expires_at + 'Z').getTime();
      const diff = Math.floor((expiresAt - Date.now()) / 1000);
      return diff > 0 ? diff : 0;
    }
    return null;
  };
  
  const [timeLeft, setTimeLeft] = useState(getInitialTimeLeft());
  const [expired, setExpired] = useState(false);
  const [linkPreview, setLinkPreview] = useState<any>(null);

  const isHidden = message.type === 'hidden' && !isOwn;

  useEffect(() => {
    // Regex for basic URL detection
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = message.content?.match(urlRegex);
    if (match && match[0] && !isHidden && !message.is_anonymous) {
       fetch(`${BASE_URL}/utils/link-preview?url=${encodeURIComponent(match[0])}`)
         .then(r => r.json())
         .then(data => {
            if (data.title || data.image) setLinkPreview(data);
         })
         .catch(() => {});
    }
  }, [message.content, isHidden, message.is_anonymous]);

  useEffect(() => {
    if (message.type === 'ephemeral' && message.expires_at && !isOwn) {
      const checkExpiry = () => {
        const expiresAt = new Date(message.expires_at.endsWith('Z') ? message.expires_at : message.expires_at + 'Z').getTime();
        const diff = Math.floor((expiresAt - Date.now()) / 1000);
        if (diff <= 0) {
          setExpired(true);
          setTimeLeft(0);
        } else {
          setTimeLeft(diff);
        }
      };
      checkExpiry();
      const timer = setInterval(checkExpiry, 1000);
      return () => clearInterval(timer);
    }
  }, [message.expires_at, isOwn]);

  const [isTimeLocked, setIsTimeLocked] = useState(false);
  const [lockRemaining, setLockRemaining] = useState('');

  useEffect(() => {
    if (!message.visible_at) return;
    const checkLock = () => {
       const now = new Date();
       const visibleTime = new Date(message.visible_at.endsWith('Z') ? message.visible_at : message.visible_at + 'Z');
       if (visibleTime > now && !isOwn) {
         setIsTimeLocked(true);
         const diff = Math.floor((visibleTime.getTime() - now.getTime()) / 1000);
         if (diff < 60) setLockRemaining(`${diff}s`);
         else if (diff < 3600) setLockRemaining(`${Math.floor(diff/60)}m ${diff%60}s`);
         else setLockRemaining(`${Math.floor(diff/3600)}h ${Math.floor((diff%3600)/60)}m`);
       } else {
         setIsTimeLocked(false);
       }
    };
    checkLock();
    const interval = setInterval(checkLock, 1000);
    return () => clearInterval(interval);
  }, [message.visible_at, isOwn]);

  if (isTimeLocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', margin: '14px 0', opacity: 0.8 }}>
        <div style={{ fontSize: '10px', color: 'var(--accent-gold)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>
          ⏰ Message Différé
        </div>
        <div style={{ padding: '12px 16px', borderRadius: '16px', background: 'var(--bg-glass)', border: '1px solid var(--accent-gold)' }}>
           <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '6px' }}>Ce message sera visible par {isOwn ? "le destinataire" : "vous"} dans {lockRemaining}.</div>
           <span style={{ fontSize: '14px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>🔒 Contenu verrouillé</span>
        </div>
      </div>
    );
  }

  if (message.type === 'ephemeral' && !isOwn && timeLeft !== null && timeLeft <= 0) {
    return (
       <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', margin: '14px 0', opacity: 0.5 }}>
         <div style={{ padding: '8px 16px', borderRadius: '16px', background: 'transparent', border: '1px dashed var(--border-glass)' }}>
            <span style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>Ce message éphémère a disparu.</span>
         </div>
       </div>
    );
  }

  const timeStr = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Render file attachment
  const renderAttachment = () => {
    if (!message.file_url) return null;
    const url = getUploadUrl(message.file_url);
    
    if (message.file_type === 'image') {
      return (
        <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden' }}>
          <img 
            src={url} 
            alt={message.file_name || 'Image'} 
            style={{ maxWidth: '300px', maxHeight: '250px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer' }}
            onClick={() => window.open(url, '_blank')}
          />
        </div>
      );
    }
    
    if (message.file_type === 'video') {
      return (
        <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden' }}>
          <video 
            src={url} 
            controls 
            style={{ maxWidth: '300px', maxHeight: '250px', borderRadius: '8px' }}
          />
        </div>
      );
    }
    
    if (message.file_type === 'audio') {
      return (
        <div style={{ marginTop: '8px' }}>
          <audio src={url} controls style={{ width: '100%', maxWidth: '280px' }} />
        </div>
      );
    }
    
    // Generic file
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="file-attachment"
        style={{
          marginTop: '8px',
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <span style={{ fontSize: '24px' }}>📎</span>
        <div>
          <div style={{ fontSize: '13px', color: 'var(--accent-gold)', fontWeight: 500 }}>{message.file_name || 'Fichier'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Cliquer pour télécharger</div>
        </div>
      </a>
    );
  };

  return (
    <div id={`msg-${message.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', margin: '14px 0', transition: 'background 0.5s ease' }}>
      
      {/* Type Labels */}
      {(message.type === 'hidden' || message.type === 'ephemeral' || message.visible_at) && (
        <div style={{ fontSize: '10px', color: 'var(--accent-gold)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>
          {message.type === 'hidden' ? '👁️ Message Caché' : (message.type === 'ephemeral' ? '⏳ Message Éphémère' : '⏰ Message Différé')}
        </div>
      )}

      {!isOwn && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px',marginLeft: '4px' }}>
          {message.is_anonymous ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>👤 Anonyme</div>
          ) : (
             <>
               <img src={message.sender_avatar} alt="" style={{ width: '16px', height: '16px', borderRadius: '8px' }} />
               <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{message.sender_username}</div>
             </>
          )}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div 
          onClick={() => { if (isHidden) setIsRevealed(!isRevealed) }}
          style={{
            background: isOwn ? 'var(--accent-royal)' : 'var(--bg-glass)',
            padding: '12px 16px',
            borderRadius: '16px',
            borderBottomRightRadius: isOwn ? '4px' : '16px',
            borderBottomLeftRadius: !isOwn ? '4px' : '16px',
            maxWidth: '100%',
            cursor: isHidden ? 'pointer' : 'default',
            border: '1px solid var(--border-glass)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.3s'
          }}
        >
          {isHidden && !isRevealed && (
            <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <span style={{ fontSize: '14px', fontWeight: 500, opacity: 0.9 }}>👀 Appuie pour voir</span>
            </div>
          )}
          
          <div style={{ filter: isHidden && !isRevealed ? 'blur(6px)' : 'none', transition: 'filter 0.3s', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            
            {/* Reply Block */}
            {message.reply_to_id && (
              <div 
                style={{ 
                  background: 'rgba(0,0,0,0.2)', 
                  borderLeft: `4px solid ${isOwn ? 'rgba(255,255,255,0.5)' : 'var(--accent-gold)'}`, 
                  padding: '6px 10px', 
                  borderRadius: '6px', 
                  marginBottom: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  const el = document.getElementById(`msg-${message.reply_to_id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                <div style={{ color: isOwn ? 'rgba(255,255,255,0.7)' : 'var(--accent-gold)', fontWeight: 'bold', marginBottom: '2px' }}>
                  {message.reply_to_sender || "Anonyme"}
                </div>
                <div style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                  {message.reply_to_content || "Message supprimé"}
                </div>
              </div>
            )}

            {/* Text content or Game */}
            {message.type === 'game_tictactoe' ? (
              <TicTacToe message={message} currentUserId={currentUserId} />
            ) : message.type === 'game_connect4' ? (
              <Connect4 message={message} currentUserId={currentUserId} />
            ) : message.type === 'game_rps' ? (
              <RockPaperScissors message={message} currentUserId={currentUserId} />
            ) : message.type === 'game_word_mystery' ? (
              <WordMystery message={message} currentUserId={currentUserId} />
            ) : (
              message.content && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <span style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {message.content.split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) => 
                      part.match(/^https?:\/\//) 
                      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)', textDecoration: 'underline' }}>{part}</a> 
                      : part
                    )}
                  </span>
                </div>
              )
            )}

            {/* File attachment */}
            {renderAttachment()}

            {/* Link Preview */}
            {linkPreview && (
              <a href={linkPreview.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column' }}>
                   {linkPreview.image && <img src={linkPreview.image} alt="Preview" style={{ width: '100%', maxHeight: '150px', objectFit: 'cover' }} />}
                   <div style={{ padding: '8px 12px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', marginBottom: '4px', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{linkPreview.title || linkPreview.url}</div>
                      {linkPreview.description && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{linkPreview.description}</div>}
                   </div>
                </div>
              </a>
            )}

            {/* Time + Read status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '2px' }}>
              <span style={{ fontSize: '10px', color: isOwn ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)' }}>{timeStr}</span>
              {/* Read receipts for own messages */}
              {isOwn && (
                <span className={message.is_read ? 'read-check' : ''} style={{ fontSize: '11px', color: message.is_read ? '#60a5fa' : 'rgba(255,255,255,0.4)', transition: 'color 0.5s ease' }}>
                  {message.is_read ? '✓✓' : '✓'}
                </span>
              )}
            </div>
          </div>

          {(message.type === 'ephemeral' && timeLeft !== null && !isOwn) && (
            <div style={{ fontSize: '10px', marginTop: '6px', color: 'var(--accent-gold)', textAlign: 'right' }}>
              ⏳ {timeLeft}s left
            </div>
          )}
        </div>

        {/* Saved Reaction Badge */}
        {message.reaction && (
          <div style={{
             position: 'absolute',
             bottom: '-12px',
             ...(isOwn ? { left: '16px' } : { right: '16px' }),
             background: 'var(--bg-primary)',
             borderRadius: '12px',
             padding: '2px 6px',
             fontSize: '14px',
             border: '1px solid var(--accent-gold)'
          }}>
            {message.reaction}
          </div>
        )}
      </div>

      {/* Actions Block (Reactions + Reply) */}
      {!isOwn && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px', opacity: 0.5, justifyContent: 'flex-start', width: '100%', alignItems: 'center' }}>
           {!message.reaction && ['👍', '❤️', '😂', '😮', '🔥'].map(emoji => (
             <span 
               key={emoji}
               style={{ cursor: 'pointer', fontSize: '12px', transition: 'transform 0.2s', display: 'inline-block' }}
               onClick={(e) => {
                  const target = e.currentTarget;
                  target.style.transform = 'scale(1.5) translateY(-5px)';
                  setTimeout(() => { target.style.transform = 'scale(1) translateY(0)'; }, 300);
                  onReaction(message.id, emoji);
               }}
             >
               {emoji}
             </span>
           ))}
           {onReply && (
             <button 
               onClick={() => onReply(message)}
               style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', marginLeft: '8px', transition: 'transform 0.2s' }}
               title="Répondre"
             >
               ↩️
             </button>
           )}
        </div>
      )}
    </div>
  );
}
