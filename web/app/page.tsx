"use client"
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAuthData, getAuthData, BASE_URL } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [identifier, setIdentifier] = useState(''); // email or username for login
  const [password, setPassword] = useState('');
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    const auth = getAuthData();
    if (auth?.token) {
      router.push('/chat');
    } else {
      setLoading(false);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isLogin) {
        const res = await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password })
        });
        const data = await res.json();
        if (res.ok) {
          setAuthData({ token: data.token, user: data.user });
          router.push('/chat');
        } else {
          setError(data.detail || "Connexion échouée");
        }
      } else {
        if (password.length < 6) {
          setError("Le mot de passe doit contenir au moins 6 caractères");
          setSubmitting(false);
          return;
        }
        const res = await fetch(`${BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             username,
             email,
             full_name: fullName,
             password,
             avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`
          })
        });
        const data = await res.json();
        if (res.ok) {
          setAuthData({ token: data.token, user: data.user });
          router.push('/chat');
        } else {
          setError(data.detail || "Inscription échouée");
        }
      }
    } catch {
      setError("Erreur réseau — vérifiez que le serveur est en cours d'exécution");
    }
    setSubmitting(false);
  };

  if (loading) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw' }}>
      <div className="glass-panel animate-slide-up" style={{ padding: '48px', maxWidth: '450px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--accent-gold)', marginBottom: '8px', fontSize: '2.5rem' }}>IQChat V2</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Secure & Royal Messaging</p>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
           <button type="button" className={`btn-alt ${isLogin ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => { setIsLogin(true); setError(''); }}>Login</button>
           <button type="button" className={`btn-alt ${!isLogin ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => { setIsLogin(false); setError(''); }}>Rejoindre</button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255, 77, 79, 0.1)',
            border: '1px solid rgba(255, 77, 79, 0.3)',
            borderRadius: '8px',
            padding: '10px 16px',
            marginBottom: '16px',
            color: '#ff6b6b',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {isLogin ? (
            <>
              <input type="text" className="input-royal" placeholder="Email ou nom d'utilisateur" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
              <input type="password" className="input-royal" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </>
          ) : (
            <>
              <input type="text" className="input-royal" placeholder="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              <input type="text" className="input-royal" placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <input type="email" className="input-royal" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" className="input-royal" placeholder="Mot de passe (min. 6 caractères)" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </>
          )}
          
          <button type="submit" className="btn-royal" style={{ width: '100%', marginTop: '8px' }} disabled={submitting}>
            {submitting ? '⏳ Chargement...' : (isLogin ? 'Connexion' : 'Créer un compte royal')}
          </button>
        </form>
      </div>
    </div>
  );
}
