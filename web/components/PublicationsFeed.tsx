"use client"
import { useState, useEffect } from 'react';
import { PublicationSkeleton } from './SkeletonLoader';
import { useToast } from './ToastProvider';
import { apiFetch, BASE_URL } from '@/lib/api';

const MAX_CHARS = 500;

export default function PublicationsFeed({ user }: any) {
  const [publications, setPublications] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [shareConfig, setShareConfig] = useState<{pubId: string, content: string, author: string} | null>(null);
  const [myChats, setMyChats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const { showToast } = useToast();

  const fetchPublications = async () => {
    try {
      const res = await apiFetch('/publications/');
      if (res.ok) setPublications(await res.json());
    } catch(err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => {
    fetchPublications();
    const interval = setInterval(fetchPublications, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const loadChatsForSharing = async () => {
    try {
       const res = await fetch(`${BASE_URL}/chats/?user_id=${user.id}`);
       if (res.ok) setMyChats(await res.json());
    } catch {}
  };

  const handleOpenShare = (pub: any) => {
    setShareConfig({ pubId: pub.id, content: pub.content, author: pub.author_username });
    loadChatsForSharing();
  };

  const executeShare = async (chatId: string) => {
    if (!shareConfig) return;
    const shareText = `[Partagé de @${shareConfig.author}]\n${shareConfig.content}`;
    try {
       await apiFetch(`/messages/send`, {
         method: 'POST',
         body: JSON.stringify({ chat_id: chatId, content: shareText })
       });
       setShareConfig(null);
       showToast('Publication partagée !', 'success');
    } catch {
      showToast('Erreur lors du partage', 'error');
    }
  };

  const handleRepost = async (pub: any) => {
    const repostText = `[♻️ Repost de @${pub.author_username}]\n\n${pub.content}`;
    try {
      const res = await apiFetch('/publications/', {
        method: 'POST',
        body: JSON.stringify({ content: repostText, repost_of_id: pub.id })
      });
      if (res.ok) {
        fetchPublications();
        showToast('Reposté avec succès !', 'success');
      }
    } catch {}
  };

  const getChatDisplayName = (c: any) => {
    if (c.type === 'group') return c.name;
    const other = c.members?.find((m: any) => m.user_id !== user.id);
    return other ? (other.full_name || other.username) : 'Discussion Privée';
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    if (content.length > MAX_CHARS) {
      showToast(`Maximum ${MAX_CHARS} caractères`, 'warning');
      return;
    }
    setPosting(true);
    try {
      const res = await apiFetch('/publications/', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim() })
      });
      if (res.ok) {
        setContent('');
        fetchPublications();
        showToast('Publication créée !', 'success');
      } else {
        const err = await res.json();
        showToast(err.detail || 'Erreur de publication', 'error');
      }
    } catch {
      showToast('Erreur réseau', 'error');
    }
    setPosting(false);
  };

  const handleReact = async (id: string, isLike: boolean) => {
    try {
      await apiFetch(`/publications/${id}/react`, {
        method: 'POST',
        body: JSON.stringify({ is_like: isLike })
      });
      fetchPublications();
    } catch {}
  };

  const handleDeletePub = async (id: string) => {
    if (!window.confirm("Voulez-vous vraiment supprimer cette publication ?")) return;
    try {
      const res = await apiFetch(`/publications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchPublications();
        showToast('Publication supprimée', 'info');
      }
    } catch {}
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderContentWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) => 
      part.match(/^https?:\/\//) 
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)', textDecoration: 'underline' }}>{part}</a> 
      : part
    );
  };

  const charsLeft = MAX_CHARS - content.length;
  const isOverLimit = charsLeft < 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--accent-gold)', fontWeight: 600 }}>🌍 Fil Public</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Search Bar */}
        <div style={{ background: 'var(--bg-glass)', borderRadius: '12px', border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
          <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>🔍</span>
          <input 
            type="text" 
            placeholder="Rechercher un auteur (pseudo ou nom)..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#FFF', padding: '12px', outline: 'none' }}
          />
        </div>

        {/* Composer */}
        <div style={{ padding: '16px', borderRadius: '16px', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <img src={user.avatar_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '20px', objectFit: 'cover' }} />
            <textarea 
              placeholder="Que voulez-vous partager ?"
              value={content}
              onChange={e => setContent(e.target.value)}
              maxLength={MAX_CHARS + 50}
              style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: 'none', color: '#FFF', resize: 'none', height: '80px', padding: '12px', borderRadius: '12px', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Character counter */}
            <span style={{ 
              fontSize: '12px', 
              color: isOverLimit ? '#ff4d4f' : charsLeft < 50 ? '#fbbf24' : 'var(--text-secondary)',
              fontWeight: isOverLimit ? 'bold' : 'normal',
              transition: 'color 0.2s',
            }}>
              {charsLeft} caractères restants
            </span>
            <button 
              onClick={handlePost} 
              disabled={posting || !content.trim() || isOverLimit}
              style={{ background: 'var(--accent-royal)', color: '#FFF', border: 'none', padding: '8px 24px', borderRadius: '20px', fontWeight: 'bold', cursor: (content.trim() && !isOverLimit) ? 'pointer' : 'not-allowed', opacity: (content.trim() && !isOverLimit) ? 1 : 0.5 }}
            >
              {posting ? '⏳...' : 'Publier'}
            </button>
          </div>
        </div>

        {/* Feed */}
        {loading ? <PublicationSkeleton /> : (
          <>
            {publications.filter(p => !searchQuery || p.author_username.toLowerCase().includes(searchQuery.toLowerCase()) || (p.author_full_name && p.author_full_name.toLowerCase().includes(searchQuery.toLowerCase()))).map(pub => (
              <div key={pub.id} className="animate-slide-up" style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: pub.is_pinned ? '1px solid var(--accent-gold)' : '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
                {pub.is_pinned && (
                   <div style={{ position: 'absolute', top: '-10px', left: '16px', background: 'var(--bg-primary)', padding: '0 8px', color: 'var(--accent-gold)', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                     <span>📌</span> Épinglé
                   </div>
                )}
                {pub.repost_of_id && (
                   <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '-4px' }}>
                     <span>🔁</span> Reposté
                   </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: pub.is_pinned ? '4px' : '0' }}>
                  <img src={pub.author_avatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '20px', objectFit: 'cover' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#FFF', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {pub.author_full_name || pub.author_username} 
                      {pub.is_supreme_admin && <span style={{ color: '#1DA1F2', fontSize: '14px' }} title="Admin Suprême">☑️</span>}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>@{pub.author_username} • {formatDate(pub.created_at)}</div>
                  </div>
                </div>
                
                <div style={{ color: '#FFF', fontSize: '15px', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {renderContentWithLinks(pub.content)}
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                  <button 
                    onClick={() => handleReact(pub.id, true)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: pub.user_reaction === true ? 'var(--accent-gold)' : 'var(--text-secondary)', transition: 'color 0.2s' }}
                  >
                    <span style={{ fontSize: '16px' }}>👍</span>
                    <span>{pub.likes}</span>
                  </button>
                  <button 
                    onClick={() => handleReact(pub.id, false)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: pub.user_reaction === false ? '#ff4d4f' : 'var(--text-secondary)', transition: 'color 0.2s' }}
                  >
                    <span style={{ fontSize: '16px' }}>👎</span>
                    <span>{pub.dislikes}</span>
                  </button>
                  <button 
                    onClick={() => handleRepost(pub)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}
                  >
                    <span style={{ fontSize: '16px' }}>♻️</span>
                    <span>{pub.reposts_count > 0 ? pub.reposts_count : 'Repost'}</span>
                  </button>
                  <button 
                    onClick={() => handleOpenShare(pub)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', marginLeft: 'auto' }}
                  >
                    <span style={{ fontSize: '16px' }}>📤</span>
                    <span>Partager</span>
                  </button>
                  {(user.username === 'admin' || user.id === pub.author_id) && (
                    <button 
                      onClick={() => handleDeletePub(pub.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff4d4f', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '12px' }}
                    >
                      <span style={{ fontSize: '14px' }}>🗑️</span> Supprimer
                    </button>
                  )}
                </div>
              </div>
            ))}
            {publications.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '48px', opacity: 0.3 }}>📝</div>
                <div>Aucune publication pour le moment. Soyez le premier !</div>
              </div>
            )}
          </>
        )}
      </div>

      {shareConfig && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-primary)', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px', border: '1px solid var(--border-glass)' }}>
             <h3 style={{ marginTop: 0, color: 'var(--accent-gold)' }}>Partager vers...</h3>
             <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', margin: '16px 0' }}>
               {myChats.map(c => (
                <button
                  key={c.id}
                  onClick={() => executeShare(c.id)}
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#FFF', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '20px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                    {c.type === 'group' ? '👥' : '👤'}
                  </div>
                  <span style={{ fontWeight: 'bold' }}>{getChatDisplayName(c)}</span>
                </button>
              ))}
               {myChats.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>Aucune conversation disponible.</span>}
             </div>
             <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
               <button onClick={() => { navigator.clipboard.writeText(`[De @${shareConfig.author}]: ${shareConfig.content}`); setShareConfig(null); showToast('Texte copié !', 'info'); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--bg-glass)', color: '#FFF', cursor: 'pointer' }}>Copier le texte</button>
               <button onClick={() => setShareConfig(null)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Annuler</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
