"use client"
import { useState, useEffect } from 'react';
import SettingsModal from './SettingsModal';
import { ChatSkeleton } from './SkeletonLoader';
import { useToast } from './ToastProvider';
import { apiFetch, clearAuthData, setAuthData, BASE_URL } from '@/lib/api';

export default function ChatList({ user, activeChatId, onSelectChat }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'chats' | 'directory'>('chats');
  const [loading, setLoading] = useState(true);
  
  const [newChatName, setNewChatName] = useState('');
  const [dirSearch, setDirSearch] = useState('');
  
  const [showSettings, setShowSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const { showToast } = useToast();

  const fetchChats = async () => {
    try {
      const res = await fetch(`${BASE_URL}/chats/?user_id=${currentUser.id}`);
      if (res.ok) setChats(await res.json());
    } catch {}
    setLoading(false);
  };

  const fetchDirectory = async () => {
    try {
      const res = await fetch(`${BASE_URL}/users/`);
      if (res.ok) setDirectory(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchChats();
    fetchDirectory();
    const interval = setInterval(() => {
      fetchChats();
      fetchDirectory();
    }, 3000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleCreateChat = async (targetUsername: string, chatName?: string, isGroup: boolean = false) => {
    if (!isGroup && !targetUsername) return;
    if (isGroup && !chatName) return;
    try {
      const res = await fetch(`${BASE_URL}/chats/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isGroup ? 'group' : 'private',
          name: chatName || targetUsername,
          member_usernames: isGroup ? [currentUser.username] : [currentUser.username, targetUsername]
        })
      });
      if (res.ok) {
        const createdChat = await res.json();
        setViewMode('chats');
        fetchChats();
        if (createdChat && createdChat.id) {
           onSelectChat(createdChat.id);
        }
        showToast(isGroup ? `Groupe "${chatName}" créé !` : `Discussion avec ${targetUsername} initiée`, 'success');
      } else {
        showToast("Impossible de créer la discussion.", 'error');
      }
    } catch {
      showToast("Erreur réseau", 'error');
    }
  };

  const handleToggleBan = async (userId: string, currentBanState: boolean) => {
    if (!window.confirm(currentBanState ? 'Débannir cet utilisateur ?' : 'Bannir cet utilisateur ?')) return;
    try {
      const res = await apiFetch(`/users/${userId}/ban`, { method: 'PUT' });
      if (res.ok) {
        fetchDirectory();
        showToast(currentBanState ? 'Utilisateur débanni' : 'Utilisateur banni', currentBanState ? 'success' : 'warning');
      }
    } catch {}
  };

  const formatDate = (dateString: string) => {
     const d = new Date(dateString);
     return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px' }}>
      {showSettings && (
         <SettingsModal user={currentUser} onClose={() => setShowSettings(false)} onSave={(u: any) => { setCurrentUser(u); setAuthData({ token: (JSON.parse(localStorage.getItem('iqchat_auth') || '{}')).token, user: u }); setShowSettings(false); showToast('Profil mis à jour !', 'success'); }} />
      )}
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={`btn-alt ${viewMode === 'chats' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setViewMode('chats')}>Messages</button>
        <button className={`btn-alt ${viewMode === 'directory' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setViewMode('directory')}>Annuaire</button>
      </div>
      
      {viewMode === 'chats' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
             <input className="input-royal" value={newChatName} onChange={e => setNewChatName(e.target.value)} placeholder="Nouveau Groupe (nom)..." style={{ flex: 1, padding: '8px 12px' }} onKeyDown={e => { if (e.key === 'Enter' && newChatName) handleCreateChat('', newChatName, true); }} />
             <button onClick={() => handleCreateChat('', newChatName, true)} disabled={!newChatName} className="btn-royal" style={{ padding: '8px 16px' }}>Groupe</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading ? <ChatSkeleton /> : chats.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '40px' }}>
                <div style={{ fontSize: '32px', opacity: 0.3, marginBottom: '8px' }}>📭</div>
                <div>Aucune conversation. Allez dans l'Annuaire !</div>
              </div>
            ) : chats.map(chat => {
               const isSelected = activeChatId === chat.id;
               const otherMember = chat.type === 'private' ? chat.members?.find((m: any) => m.user_id !== currentUser.id) : null;
               const otherUser = otherMember ? directory.find(u => u.id === otherMember.user_id) : null;
               
               return (
                 <div key={chat.id} onClick={() => onSelectChat(chat.id)} style={{ padding: '12px 16px', cursor: 'pointer', borderRadius: '12px', background: isSelected ? 'rgba(212, 175, 55, 0.1)' : 'var(--bg-glass)', border: `1px solid ${isSelected ? 'var(--accent-gold)' : 'transparent'}`, transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                     {chat.type === 'private' && otherUser ? (
                        <div style={{ position: 'relative' }}>
                          <img src={otherUser.avatar_url} style={{ width: '32px', height: '32px', borderRadius: '16px' }} />
                          {otherUser.is_online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '5px', border: '2px solid #0B0A10' }} />}
                        </div>
                     ) : (
                        <div style={{ width: '32px', height: '32px', borderRadius: '16px', background: 'var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'black', fontWeight: 'bold', fontSize: '14px' }}>
                          {chat.type === 'private' && otherUser ? (otherUser.full_name || otherUser.username).charAt(0).toUpperCase() : (chat.name ? chat.name.charAt(0).toUpperCase() : 'G')}
                        </div>
                     )}
                     <div>
                       <div style={{ fontWeight: 500, color: isSelected ? 'var(--accent-gold)' : 'white' }}>
                          {chat.type === 'private' && otherUser ? (otherUser.full_name || otherUser.username) : (chat.name || "Group")}
                       </div>
                       <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{chat.type} chat</div>
                     </div>
                   </div>
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                     {chat.status === 'pending' ? (
                        <div style={{ fontSize: '11px', color: 'var(--accent-gold)' }}>
                           {chat.members?.find((m: any) => m.user_id === currentUser.id)?.role === 'admin' ? '⏳ Invitation envoyée' : '⏳ Nouvelle invitation !'}
                        </div>
                     ) : (
                        <>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatDate(chat.last_message_at || chat.created_at)}</div>
                          {chat.unread_count > 0 && (
                             <div style={{ backgroundColor: '#4ade80', color: 'black', fontSize: '10px', fontWeight: 'bold', minWidth: '18px', height: '18px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                               {chat.unread_count}
                             </div>
                          )}
                        </>
                     )}
                   </div>
                 </div>
               );
            })}
          </div>
        </>
      )}

      {viewMode === 'directory' && (
         <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <input className="input-royal" value={dirSearch} onChange={e => setDirSearch(e.target.value)} placeholder="🔍 Rechercher un utilisateur..." style={{ padding: '10px 14px', paddingRight: dirSearch ? '36px' : '14px' }} />
              {dirSearch && (
                <button onClick={() => setDirSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px' }}>✕</button>
              )}
            </div>
            {directory.filter(u => {
              if (u.id === currentUser.id) return false;
              if (u.is_banned && currentUser.username !== 'admin') return false;
              if (!dirSearch) return true;
              const q = dirSearch.toLowerCase();
              return (u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q));
            }).map(u => (
               <div key={u.id} onClick={() => handleCreateChat(u.username, u.full_name)} style={{ padding: '12px 16px', cursor: 'pointer', borderRadius: '12px', background: 'var(--bg-glass)', border: `1px solid transparent`, display: 'flex', alignItems: 'center', gap: '12px', opacity: u.is_banned ? 0.5 : 1 }}>
                  <div style={{ position: 'relative' }}>
                    <img src={u.avatar_url} style={{ width: '40px', height: '40px', borderRadius: '20px' }} />
                    {u.is_online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', backgroundColor: '#4ade80', borderRadius: '6px', border: '2px solid #0B0A10' }} />}
                  </div>
                  <div>
                     <div style={{ color: 'white', fontWeight: 500, textDecoration: u.is_banned ? 'line-through' : 'none' }}>{u.full_name}</div>
                     <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>@{u.username} {u.is_banned && <span style={{color: '#ff4d4f', fontWeight: 'bold'}}>[Banni]</span>}</div>
                  </div>
                  {currentUser.username === 'admin' && u.username !== 'admin' && (
                     <button 
                       onClick={(e) => { e.stopPropagation(); handleToggleBan(u.id, u.is_banned); }}
                       style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', background: u.is_banned ? 'var(--bg-primary)' : 'rgba(255, 77, 79, 0.1)', color: u.is_banned ? '#4ade80' : '#ff4d4f', border: `1px solid ${u.is_banned ? '#4ade80' : '#ff4d4f'}`, fontWeight: 'bold' }}
                     >
                        {u.is_banned ? '♻️ Débannir' : '🛑 Bannir'}
                     </button>
                  )}
               </div>
            ))}
         </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setShowSettings(true)}>
           <img src={currentUser.avatar_url} alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '20px', background: 'white' }} />
           <div>
             <div style={{ fontWeight: 600 }}>{currentUser.full_name}</div>
             <div style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>⚙️ Paramètres</div>
           </div>
         </div>
         <button onClick={() => { clearAuthData(); window.location.href='/'; }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>🚪</button>
      </div>
    </div>
  );
}
