import { useState, useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import { MessageSkeleton } from './SkeletonLoader';
import { useToast } from './ToastProvider';
import { apiFetch, getChatWsUrl, BASE_URL } from '@/lib/api';

const chatCache: Record<string, { chatInfo: any; messages: any[] }> = {};

export default function ChatWindow({ user, chatId }: any) {
  const cached = chatCache[chatId];
  const [chatInfo, setChatInfo] = useState<any>(cached ? cached.chatInfo : null);
  const [messages, setMessages] = useState<any[]>(cached ? cached.messages : []);
  const [loading, setLoading] = useState(!cached);
  const [showAddMember, setShowAddMember] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { showToast } = useToast();

  const [replyingTo, setReplyingTo] = useState<any>(null);

  // Typing indicator state
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Add member modal state
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);

  useEffect(() => {
    if (showAddMember) {
      apiFetch('/users/me/contacts').then(r => r.json()).then(data => setContacts(data)).catch(console.error);
    }
  }, [showAddMember, user.id]);

  const handleAddMembers = async () => {
    if (selectedUsernames.length === 0) return;
    try {
      const res = await apiFetch(`/chats/${chatId}/add_members`, {
        method: 'POST',
        body: JSON.stringify({ member_usernames: selectedUsernames })
      });
      if (res.ok) {
         setShowAddMember(false);
         setSelectedUsernames([]);
         const chatRes = await fetch(`${BASE_URL}/chats/${chatId}?user_id=${user.id}`);
         if (chatRes.ok) setChatInfo(await chatRes.json());
         showToast(`${selectedUsernames.length} membre(s) ajouté(s)`, 'success');
      }
    } catch {}
  };

  const handleLeaveChat = async () => {
    const isPrivate = chatInfo?.type === 'private';
    if (!window.confirm(isPrivate ? "Voulez-vous masquer cette conversation ?" : "Voulez-vous quitter ce groupe ?")) return;
    try {
      const res = await apiFetch(`/chats/${chatId}/leave`, { method: 'DELETE' });
      if (res.ok) window.location.reload();
    } catch {}
  };

  const handleDeleteChat = async () => {
    if (!window.confirm("Voulez-vous détruire CE GROUPE de manière définitive pour TOUT LE MONDE ?")) return;
    try {
      const res = await apiFetch(`/chats/${chatId}`, { method: 'DELETE' });
      if (res.ok) window.location.reload();
    } catch {}
  };

  const handleKickMember = async (targetUserId: string) => {
    if (!window.confirm("Expulser ce membre ?")) return;
    try {
      const res = await apiFetch(`/chats/${chatId}/members/${targetUserId}`, { method: 'DELETE' });
      if (res.ok) {
         const chatRes = await fetch(`${BASE_URL}/chats/${chatId}?user_id=${user.id}`);
         if (chatRes.ok) setChatInfo(await chatRes.json());
         showToast('Membre expulsé', 'warning');
      }
    } catch {}
  };

  // Search messages
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
    const debounce = setTimeout(handleSearch, 300);
    return () => clearTimeout(debounce);
  }, [handleSearch]);

  useEffect(() => {
    const cached = chatCache[chatId];
    if (cached) {
      setChatInfo(cached.chatInfo);
      setMessages(cached.messages);
      setLoading(false);
    } else {
      setLoading(true);
      setChatInfo(null);
      setMessages([]);
    }

    const fetchChat = async () => {
      try {
        const res = await fetch(`${BASE_URL}/chats/${chatId}?user_id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          const prevCached = chatCache[chatId];
          const hasChanged = !prevCached || 
                             prevCached.messages.length !== data.messages.length ||
                             prevCached.messages[prevCached.messages.length - 1]?.id !== data.messages[data.messages.length - 1]?.id ||
                             prevCached.messages.some((msg, idx) => msg.is_read !== data.messages[idx]?.is_read || msg.reaction !== data.messages[idx]?.reaction);
          
          chatCache[chatId] = { chatInfo: data, messages: data.messages };
          setChatInfo(data);
          if (hasChanged) {
            setMessages(data.messages);
          }
        }
      } catch {}
      setLoading(false);
    };
    fetchChat();

    const ws = new WebSocket(getChatWsUrl(chatId, user.id));
    wsRef.current = ws;
    
    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Handle typed events
      if (data.event === 'typing') {
        if (data.is_typing) {
          setTypingUser(data.username);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
        } else {
          setTypingUser(null);
        }
        return;
      }
      
      if (data.event === 'read') {
        setMessages(prev => {
          const newMsgs = prev.map(m => 
            m.sender_id === user.id ? { ...m, is_read: true } : m
          );
          if (chatCache[chatId]) {
            chatCache[chatId].messages = newMsgs;
          }
          return newMsgs;
        });
        return;
      }
      
      // Regular message
      setMessages((prev) => {
        const newMsgs = (() => {
          // 1. Try to match by real database ID
          const idx = prev.findIndex(m => m.id === data.id);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = data;
            return updated;
          }

          // 2. Try to match by optimistic sending status and content/sender
          if (data.sender_id === user.id) {
             const optIdx = prev.findIndex(m => m.status === 'sending' && m.content === data.content);
             if (optIdx !== -1) {
                const updated = [...prev];
                updated[optIdx] = data; // replace temp with server response
                return updated;
             }
          }
          
          return [...prev, data];
        })();

        if (chatCache[chatId]) {
          chatCache[chatId].messages = newMsgs;
        }
        return newMsgs;
      });
    };

    // Poll chat info every 30s to detect status changes (invite accepted, members updated, etc.)
    const chatPollInterval = setInterval(async () => {
      try {
        const res = await apiFetch(`/chats/${chatId}?user_id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          chatCache[chatId] = { chatInfo: data, messages: data.messages };
          setChatInfo(data);
        }
      } catch {}
    }, 30000);

    return () => {
      ws.close();
      wsRef.current = null;
      clearInterval(chatPollInterval);
    };
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send typing event via WebSocket
  const sendTypingEvent = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: 'typing',
        username: user.username || user.full_name,
        is_typing: isTyping,
      }));
    }
  }, [user]);

  const handleSend = async (msgData: any) => {
    sendTypingEvent(false); // Stop typing indicator
    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      id: tempId,
      chat_id: chatId,
      sender_id: user.id,
      sender_username: user.username,
      sender_name: user.full_name || user.username,
      sender_avatar: user.avatar_url,
      content: msgData.content || '',
      file_url: msgData.file_url || null,
      file_type: msgData.file_type || null,
      file_name: msgData.file_name || null,
      created_at: new Date().toISOString(),
      type: msgData.type || 'text',
      visible_at: msgData.visible_at || null,
      expires_at: msgData.expires_at || null,
      reply_to_id: msgData.reply_to_id || null,
      reply_to_sender: msgData.reply_to_sender || null,
      reply_to_content: msgData.reply_to_content || null,
      is_anonymous: msgData.is_anonymous || false,
      reactions: [],
      status: 'sending'
    };

    setMessages(prev => {
      const newMsgs = [...prev, tempMessage];
      if (chatCache[chatId]) {
        chatCache[chatId].messages = newMsgs;
      }
      return newMsgs;
    });
    setReplyingTo(null);

    try {
      const res = await apiFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ chat_id: chatId, ...msgData })
      });
      if (!res.ok) {
        setMessages(prev => {
          const newMsgs = prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m);
          if (chatCache[chatId]) {
            chatCache[chatId].messages = newMsgs;
          }
          return newMsgs;
        });
      }
    } catch {
      setMessages(prev => {
        const newMsgs = prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m);
        if (chatCache[chatId]) {
          chatCache[chatId].messages = newMsgs;
        }
        return newMsgs;
      });
    }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    try {
      await apiFetch(`/messages/${msgId}/reaction`, {
        method: 'PUT',
        body: JSON.stringify({ emoji })
      });
    } catch {}
  };

  const handleAccept = async () => {
    try {
      const res = await apiFetch(`/chats/${chatId}/accept?user_id=${user.id}`, { method: 'PATCH' });
      if (res.ok) {
        // Re-fetch full chat data so input bar appears instantly
        const chatRes = await apiFetch(`/chats/${chatId}?user_id=${user.id}`);
        if (chatRes.ok) {
          const data = await chatRes.json();
          chatCache[chatId] = { chatInfo: data, messages: data.messages };
          setChatInfo(data);
          setMessages(data.messages);
        }
        showToast('Invitation acceptée !', 'success');
      }
    } catch {}
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  if (loading) return <MessageSkeleton />;
  if (!chatInfo) return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Chat introuvable</div>;

  const isPrivate = chatInfo.type === 'private';
  const otherMember = isPrivate ? chatInfo.members.find((m: any) => m.user_id !== user.id) : null;
  const amIAdmin = chatInfo.members.find((m: any) => m.user_id === user.id)?.role === 'admin';
  const isPending = chatInfo.status === 'pending';
  const onlineStatusText = isPrivate 
      ? (otherMember?.is_online ? '🟢 En ligne' : null)
      : `${chatInfo.members?.length || 0} participants`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid var(--border-glass)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        {(isPrivate && otherMember?.avatar_url) ? (
          <img 
             src={otherMember.avatar_url} 
             alt="Avatar" 
             style={{ width: '40px', height: '40px', borderRadius: '20px', cursor: 'pointer', objectFit: 'cover' }}
             onClick={() => setViewImage(otherMember.avatar_url)}
          />
        ) : (
          <div style={{ width: '40px', height: '40px', borderRadius: '20px', background: 'var(--accent-gold-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'black' }}>
            {isPrivate ? (otherMember ? (otherMember.full_name || otherMember.username).charAt(0).toUpperCase() : 'C') : (chatInfo.name ? chatInfo.name.charAt(0).toUpperCase() : 'G')}
          </div>
        )}
        <div>
          <h3 style={{ margin: 0, color: 'var(--accent-gold)' }}>
             {isPrivate ? (otherMember ? (otherMember.full_name || otherMember.username) : 'Chat') : `${chatInfo.name || 'Group Chat'} ${amIAdmin ? '👑' : ''}`}
          </h3>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
             {onlineStatusText}
          </div>
        </div>
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
           {/* Search toggle */}
           <button 
             onClick={() => setShowSearch(!showSearch)}
             style={{ padding: '6px 12px', borderRadius: '8px', background: showSearch ? 'rgba(212,175,55,0.2)' : 'transparent', border: '1px solid var(--border-glass)', color: showSearch ? 'var(--accent-gold)' : 'white', cursor: 'pointer', fontSize: '12px' }}
             title="Rechercher (Ctrl+F)"
           >
             🔍
           </button>
           {!isPrivate && amIAdmin && (
              <button 
                onClick={() => setShowAddMember(true)}
                style={{ padding: '6px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', cursor: 'pointer', fontSize: '12px' }}
                title="Gérer les membres"
              >
                + Membres
              </button>
           )}
           <button 
             onClick={handleLeaveChat}
             style={{ padding: '6px 12px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-glass)', color: 'white', cursor: 'pointer', fontSize: '12px' }}
             title={isPrivate ? "Masquer la discussion" : "Quitter le groupe"}
           >
             🚪 Sortir
           </button>
           {!isPrivate && amIAdmin && (
              <button 
                onClick={handleDeleteChat}
                style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                title="Détruire le groupe pour tous"
              >
                🗑️ Détruire
              </button>
           )}
        </div>
      </div>
      {/* Connection Offline Alert Banner */}
      {!isConnected && (
        <div style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.15)', 
          borderBottom: '1px solid rgba(239, 68, 68, 0.3)', 
          padding: '8px 24px', 
          fontSize: '13px', 
          color: '#ff4d4f', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          animation: 'slideUp 0.3s ease' 
        }}>
          <span className="skeleton-pulse">⚠️</span> Connexion royale interrompue. Tentative de reconnexion...
        </div>
      )}
      {/* Search Bar */}
      {showSearch && (
        <div className="animate-slide-up" style={{ padding: '8px 24px', borderBottom: '1px solid var(--border-glass)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            className="input-royal"
            placeholder="Rechercher dans les messages..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
            style={{ flex: 1, padding: '8px 12px' }}
          />
          {searchResults.length > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {searchResults.length} résultat(s)
            </span>
          )}
        </div>
      )}

      {/* Search Results Overlay */}
      {showSearch && searchResults.length > 0 && (
        <div style={{ maxHeight: '200px', overflowY: 'auto', borderBottom: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.3)' }}>
          {searchResults.map(r => (
            <div key={r.id} style={{ padding: '8px 24px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}
              onClick={() => {
                const el = document.getElementById(`msg-${r.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.style.background = 'rgba(212, 175, 55, 0.15)';
                  setTimeout(() => { el.style.background = ''; }, 2000);
                }
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>{r.sender_username} • {new Date(r.created_at).toLocaleString()}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.content}</div>
            </div>
          ))}
        </div>
      )}

      {showAddMember && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
           <div style={{ background: 'var(--bg-secondary)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-glass)', width: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <h3 style={{ margin: 0, color: 'var(--accent-gold)' }}>Membres Actuels</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '8px' }}>
                {chatInfo.members.map((m: any) => (
                  <div key={m.user_id} style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                     <span style={{ color: 'white', fontSize: '14px' }}>{m.username} {m.role === 'admin' ? '👑' : ''}</span>
                     {!isPrivate && amIAdmin && m.user_id !== user.id && (
                        <button onClick={() => handleKickMember(m.user_id)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Retirer</button>
                     )}
                  </div>
                ))}
              </div>

              <h3 style={{ margin: 0, color: 'var(--accent-gold)' }}>Ajouter des membres</h3>
              {contacts.length === 0 ? (
                 <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Vous n&apos;avez aucun contact disponible.</div>
              ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                   {contacts.map(c => {
                      const isAlreadyInGroup = chatInfo.members.some((m: any) => m.user_id === c.id);
                      if (isAlreadyInGroup) return null;
                      const isSelected = selectedUsernames.includes(c.username);
                      
                      return (
                         <div 
                           key={c.id} 
                           onClick={() => setSelectedUsernames(prev => isSelected ? prev.filter(u => u !== c.username) : [...prev, c.username])}
                           style={{ padding: '8px', borderRadius: '8px', background: isSelected ? 'rgba(212,175,55,0.2)' : 'var(--bg-glass)', border: `1px solid ${isSelected ? 'var(--accent-gold)' : 'transparent'}`, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                         >
                           <img src={c.avatar_url} style={{ width: '24px', height: '24px', borderRadius: '12px' }} />
                           <span style={{ color: 'white', fontSize: '14px' }}>{c.full_name}</span>
                         </div>
                      )
                   })}
                 </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                 <button onClick={() => setShowAddMember(false)} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--border-glass)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}>Annuler</button>
                 {contacts.length > 0 && (
                   <button onClick={handleAddMembers} disabled={selectedUsernames.length === 0} style={{ flex: 1, padding: '8px', background: 'var(--accent-gold-gradient)', border: 'none', color: 'black', fontWeight: 'bold', borderRadius: '8px', cursor: selectedUsernames.length === 0 ? 'not-allowed' : 'pointer', opacity: selectedUsernames.length === 0 ? 0.5 : 1 }}>Ajouter</button>
                 )}
              </div>
           </div>
         </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
         {messages.length === 0 ? (
           <div style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
             <div style={{ fontSize: '48px', opacity: 0.3 }}>🚀</div>
             <div>Aucun message. Envoyez un 🚀 pour commencer !</div>
           </div>
         ) : (
           messages.map((msg, i) => (
             <MessageBubble 
              key={msg.id} 
              message={msg} 
              isOwn={msg.sender_id === user.id}
              currentUserId={user.id}
              onReaction={handleReaction}
              onReply={() => setReplyingTo(msg)}
            />
           ))
         )}
         {/* Typing indicator */}
         {typingUser && <TypingIndicator username={typingUser} />}
         <div ref={messagesEndRef} />
      </div>

      {isPending ? (
        <div style={{ padding: '24px', textAlign: 'center', borderTop: '1px solid var(--border-glass)' }}>
          {amIAdmin ? (
             <span style={{ color: 'var(--text-secondary)' }}>⏳ En attente de l&apos;acceptation de l&apos;utilisateur...</span>
          ) : (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
               <span style={{ color: 'var(--accent-gold)' }}>🤝 Ce contact souhaite discuter avec vous.</span>
               <button 
                 onClick={handleAccept} 
                 style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--accent-gold-gradient)', color: 'black', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
               >
                 Accepter pour discuter
               </button>
             </div>
          )}
        </div>
      ) : (
        <MessageInput 
          onSend={handleSend} 
          onTyping={sendTypingEvent} 
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      )}

      {/* Full Screen Image Viewer */}
      {viewImage && (
        <div 
          onClick={() => setViewImage(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <img src={viewImage} alt="Profile Large" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
        </div>
      )}
    </div>
  );
}
