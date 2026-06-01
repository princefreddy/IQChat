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
  const [activeView, setActiveView] = useState<'chats' | 'feed'>('chats');
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
    const interval = setInterval(checkFeed, 3000);
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
          <div style={{ display: 'flex', padding: '12px', gap: '8px', borderBottom: '1px solid var(--border-glass)' }}>
            <button 
              onClick={() => {
                setActiveChatId(null);
                setActiveView('chats');
              }}
              style={{ flex: 1, padding: '8px', background: activeView === 'chats' ? 'var(--accent-royal)' : 'transparent', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Discussions
            </button>
            <button 
              onClick={handleSwitchToFeed}
              style={{ flex: 1, position: 'relative', padding: '8px', background: activeView === 'feed' ? 'var(--accent-gold)' : 'transparent', color: activeView === 'feed' ? '#000' : '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Fil Public
              {hasNewFeed && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', backgroundColor: '#ff4d4f', borderRadius: '4px' }} />}
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeView === 'chats' ? (
              <ChatList user={user} activeChatId={activeChatId} onSelectChat={setActiveChatId} />
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Découvrez les dernières publications de la communauté sur le Fil Public.
              </div>
            )}
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
          {activeView === 'feed' ? (
            <PublicationsFeed user={user} />
          ) : activeChatId ? (
            <ChatWindow user={user} chatId={activeChatId} />
          ) : (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '48px', opacity: 0.3 }}>💬</div>
              <div>Sélectionnez une conversation ou passez sur le Fil Public.</div>
              <div style={{ fontSize: '12px', opacity: 0.5 }}>Appuyez sur Escape pour revenir aux discussions</div>
            </div>
          )}
        </div>
      </div>
    </ToastProvider>
  );
}
