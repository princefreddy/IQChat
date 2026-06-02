"use client"
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatList from '@/components/ChatList';
import ChatWindow from '@/components/ChatWindow';
import PublicationsFeed from '@/components/PublicationsFeed';
import ToastProvider from '@/components/ToastProvider';
import { getAuthData, BASE_URL } from '@/lib/api';

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'chats' | 'feed' | 'announcement'>('chats');
  const [hasNewFeed, setHasNewFeed] = useState(false);

  useEffect(() => {
    const auth = getAuthData();
    if (!auth?.token) {
      router.push('/');
    } else {
      setUser(auth.user);
    }
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const checkFeed = async () => {
      try {
        const res = await fetch(`${BASE_URL}/publications/latest_time`);
        const data = await res.json();
        if (data.latest_time) {
           const lastSeen = localStorage.getItem('iqchat_last_seen_feed');
           if (!lastSeen || new Date(data.latest_time).getTime() > new Date(lastSeen).getTime()) {
              if (activeView !== 'feed') setHasNewFeed(true);
           }
        }
      } catch {}
    };
    checkFeed();
    const interval = setInterval(checkFeed, 30000);
    return () => clearInterval(interval);
  }, [user, activeView]);

  const handleSwitchToFeed = () => {
     setActiveView('feed');
     setHasNewFeed(false);
     localStorage.setItem('iqchat_last_seen_feed', new Date().toISOString());
  };

  // Keyboard shortcut: Escape to go back to chats
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeView === 'feed') setActiveView('chats');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView]);

  if (!user) return null;

  const isShowSidebar = !activeChatId && activeView === 'chats';
  const isShowChat = !!activeChatId || activeView === 'feed';

  return (
    <ToastProvider>
      <div className={`app-container ${isShowSidebar ? 'show-sidebar' : 'show-chat'}`}>
        <div className="sidebar glass-panel animate-slide-up" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', padding: '12px', gap: '8px', borderBottom: '1px solid var(--border-glass)', flexWrap: 'wrap' }}>
            <button 
              onClick={() => {
                setActiveView('chats');
              }}
              style={{ flex: 1, minWidth: '80px', padding: '8px', background: activeView === 'chats' ? 'var(--accent-royal)' : 'transparent', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
            >
              Discussions
            </button>
            <button 
              onClick={handleSwitchToFeed}
              style={{ flex: 1, minWidth: '80px', position: 'relative', padding: '8px', background: activeView === 'feed' ? 'var(--accent-gold)' : 'transparent', color: activeView === 'feed' ? '#000' : '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
            >
              Fil Public
              {hasNewFeed && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', backgroundColor: '#ff4d4f', borderRadius: '4px' }} />}
            </button>
            {user.username === 'admin' && (
              <button 
                onClick={() => {
                  setActiveView('announcement');
                  setActiveChatId(null);
                }}
                style={{ flex: 1, minWidth: '80px', padding: '8px', background: activeView === 'announcement' ? 'rgba(197, 160, 59, 0.2)' : 'transparent', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
              >
                📢 Annonce
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }} className="animate-fade-in">
            <div style={{ display: activeView === 'chats' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <ChatList user={user} activeChatId={activeChatId} onSelectChat={setActiveChatId} />
            </div>
            <div style={{ display: activeView === 'feed' ? 'block' : 'none', padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Découvrez les dernières publications de la communauté sur le Fil Public.
            </div>
          </div>
        </div>
        <div className="chat-main glass-panel animate-slide-up" style={{ animationDelay: '0.1s' }}>
          {/* Mobile Only Header Bar for Back Navigation */}
          {(activeChatId || activeView === 'feed') && (
            <div 
              style={{ 
                padding: '8px 16px', 
                borderBottom: '1px solid var(--border-glass)', 
                background: 'rgba(0,0,0,0.15)',
                display: 'none', // Overridden by media query in globals.css
                alignItems: 'center'
              }} 
              className="mobile-back-btn"
            >
              <button 
                onClick={() => {
                  setActiveChatId(null);
                  setActiveView('chats');
                }} 
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--accent-gold)',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                ← Retour aux Discussions
              </button>
            </div>
          )}
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
            <div style={{ display: activeView === 'feed' ? 'flex' : 'none', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
              <PublicationsFeed user={user} />
            </div>
            <div style={{ display: (activeView === 'chats' && activeChatId) ? 'flex' : 'none', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
              {activeChatId && <ChatWindow user={user} chatId={activeChatId} />}
            </div>
            <div style={{ display: (activeView === 'chats' && !activeChatId) ? 'flex' : 'none', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: 'var(--text-secondary)', height: '100%' }}>
              <div style={{ fontSize: '48px', opacity: 0.3 }}>💬</div>
              <div>Sélectionnez une conversation ou passez sur le Fil Public.</div>
              <div style={{ fontSize: '12px', opacity: 0.5 }}>Appuyez sur Escape pour revenir aux discussions</div>
            </div>
            {user.username === 'admin' && (
              <div style={{ display: activeView === 'announcement' ? 'flex' : 'none', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden', padding: '40px', alignItems: 'center', justifyContent: 'center' }}>
                <AnnouncementComposer />
              </div>
            )}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}

function AnnouncementComposer() {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    setError('');
    setSuccessCount(null);
    try {
      const auth = getAuthData();
      const res = await fetch(`${BASE_URL}/chats/announcement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth?.token}`
        },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessCount(data.sent_count);
        setContent('');
      } else {
        const data = await res.json();
        setError(data.detail || "Échec de l'envoi de l'annonce.");
      }
    } catch (err) {
      setError("Erreur réseau lors de l'envoi.");
    }
    setSending(false);
  };

  return (
    <div className="glass-panel" style={{ padding: '30px', maxWidth: '600px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(197, 160, 59, 0.3)', borderRadius: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '32px' }}>📢</span>
        <div style={{ textAlign: 'left' }}>
          <h2 style={{ margin: 0, color: 'var(--accent-gold)' }}>Créer une Annonce Royale</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Ce message sera envoyé en privé à CHAQUE utilisateur inscrit au royaume.</p>
        </div>
      </div>

      {successCount !== null && (
        <div style={{ padding: '12px', background: 'rgba(39, 174, 96, 0.1)', border: '1px solid #27ae60', color: '#2ecc71', borderRadius: '8px', fontSize: '14px', textAlign: 'left' }}>
          ✓ Annonce royale envoyée avec succès à <strong>{successCount}</strong> utilisateur(s) !
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: 'rgba(231, 76, 60, 0.1)', border: '1px solid #e74c3c', color: '#e74c3c', borderRadius: '8px', fontSize: '14px', textAlign: 'left' }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <textarea
          className="input-royal"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Écrivez le message de votre annonce ici..."
          style={{ width: '100%', height: '180px', padding: '16px', borderRadius: '12px', resize: 'vertical', fontSize: '15px', color: 'white', lineHeight: '1.5' }}
          required
          disabled={sending}
        />
        
        <button 
          type="submit" 
          className="btn-royal" 
          disabled={sending || !content.trim()} 
          style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: 'bold' }}
        >
          {sending ? "⏳ Envoi royal en cours..." : "Diffuser l'Annonce 🚀"}
        </button>
      </form>
    </div>
  );
}
