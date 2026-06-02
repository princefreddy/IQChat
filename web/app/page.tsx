"use client"
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAuthData, getAuthData, BASE_URL, fetchWithRetry } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);

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
    setWakingUp(false);

    // Set a timer to show "waking up" message if it takes more than 4 seconds
    const wakingTimer = setTimeout(() => {
      setWakingUp(true);
    }, 4000);

    try {
      if (isLogin) {
        const res = await fetchWithRetry(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
          timeout: 30000,
          retries: 6,
          delay: 2000
        });
        const data = await res.json();
        clearTimeout(wakingTimer);
        if (res.ok) {
          setAuthData({ token: data.token, user: data.user });
          router.push('/chat');
        } else {
          setError(data.detail || "Connexion échouée");
        }
      } else {
        if (password.length < 6) {
          clearTimeout(wakingTimer);
          setError("Le mot de passe doit contenir au moins 6 caractères");
          setSubmitting(false);
          return;
        }
        const res = await fetchWithRetry(`${BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             username,
             email,
             full_name: fullName,
             password,
             avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`
          }),
          timeout: 30000,
          retries: 6,
          delay: 2000
        });
        const data = await res.json();
        clearTimeout(wakingTimer);
        if (res.ok) {
          setAuthData({ token: data.token, user: data.user });
          router.push('/chat');
        } else {
          setError(data.detail || "Inscription échouée");
        }
      }
    } catch {
        clearTimeout(wakingTimer);
        setError("Connexion en cours... Veuillez patienter quelques instants.");
      }
      setSubmitting(false);
    setWakingUp(false);
  };

  if (loading) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', width: '100vw', padding: '20px' }}>
      <div className="glass-panel animate-slide-up" style={{ padding: '40px', maxWidth: '450px', width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(212, 175, 55, 0.15)' }}>
        
        {/* Logo and Name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
          <img 
            src="/logo.png" 
            alt="IQChat Logo" 
            style={{ 
              width: '90px', 
              height: '90px', 
              borderRadius: '24px', 
              marginBottom: '16px',
              boxShadow: '0 8px 24px rgba(197, 160, 59, 0.25)',
              border: '2px solid rgba(197, 160, 59, 0.4)'
            }} 
          />
          <h1 style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '2.5rem', letterSpacing: '1px', textShadow: '0 2px 10px rgba(197, 160, 59, 0.15)' }}>IQChat</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '4px' }}>Royaume de Messagerie Sécurisée</p>
        </div>
        
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '14px' }}>
           <button 
             type="button" 
             className={`btn-alt ${isLogin ? 'active' : ''}`} 
             style={{ 
               flex: 1, 
               border: 'none', 
               borderRadius: '10px', 
               padding: '10px', 
               background: isLogin ? 'var(--accent-gold-gradient)' : 'transparent',
               color: isLogin ? '#1A1A1A' : 'var(--text-secondary)',
               fontWeight: 600,
               transition: 'all 0.3s'
             }} 
             onClick={() => { setIsLogin(true); setError(''); }}
           >
             Connexion
           </button>
           <button 
             type="button" 
             className={`btn-alt ${!isLogin ? 'active' : ''}`} 
             style={{ 
               flex: 1, 
               border: 'none', 
               borderRadius: '10px', 
               padding: '10px', 
               background: !isLogin ? 'var(--accent-gold-gradient)' : 'transparent',
               color: !isLogin ? '#1A1A1A' : 'var(--text-secondary)',
               fontWeight: 600,
               transition: 'all 0.3s'
             }} 
             onClick={() => { setIsLogin(false); setError(''); }}
           >
             Rejoindre
           </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255, 77, 79, 0.1)',
            border: '1px solid rgba(255, 77, 79, 0.3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#ff6b6b',
            fontSize: '14px',
            textAlign: 'left'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {isLogin ? (
            <>
              <input type="text" className="input-royal" placeholder="Email ou nom d'utilisateur" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
              <div style={{ position: 'relative', width: '100%' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  className="input-royal" 
                  placeholder="Mot de passe" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  style={{ paddingRight: '48px' }}
                  required 
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <input type="text" className="input-royal" placeholder="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              <input type="text" className="input-royal" placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <input type="email" className="input-royal" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <div style={{ position: 'relative', width: '100%' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  className="input-royal" 
                  placeholder="Mot de passe (min. 6 caractères)" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  style={{ paddingRight: '48px' }}
                  required 
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
          
          <button type="submit" className="btn-royal" style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '12px', fontSize: '1.05rem' }} disabled={submitting}>
            {submitting ? '⏳ Traitement royal...' : (isLogin ? 'Accéder au Royaume' : 'Créer mon Compte Royal')}
          </button>
        </form>
        {wakingUp && (
          <div style={{
            marginTop: '20px',
            padding: '12px',
            background: 'rgba(197, 160, 59, 0.08)',
            border: '1px solid rgba(197, 160, 59, 0.2)',
            borderRadius: '10px',
            color: 'var(--accent-gold)',
            fontSize: '13px',
            lineHeight: '1.5',
            textAlign: 'center'
          }}>
            Connexion en cours... Veuillez patienter quelques instants.
          </div>
        )}
      </div>
    </div>
  );
}

