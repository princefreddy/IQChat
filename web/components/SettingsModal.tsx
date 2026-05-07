"use client"
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from './ToastProvider';

export default function SettingsModal({ user, onClose, onSave }: any) {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const { showToast } = useToast();

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates: any = { full_name: fullName, avatar_url: avatarUrl };
      if (password) {
        if (password.length < 6) {
          showToast('Le mot de passe doit contenir au moins 6 caractères', 'error');
          setSaving(false);
          return;
        }
        updates.password = password;
      }

      const res = await apiFetch('/users/me', {
         method: 'PUT',
         body: JSON.stringify(updates)
      });
      if (res.ok) {
         const data = await res.json();
         onSave(data);
      } else {
         showToast("Impossible de mettre à jour le profil", 'error');
      }
    } catch(err) { 
      showToast("Erreur réseau", 'error');
    }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
       <div className="glass-panel animate-slide-up" style={{ width: '100%', maxWidth: '400px', padding: '32px' }} onClick={e => e.stopPropagation()}>
         <h2 style={{ color: 'var(--accent-gold)', marginBottom: '24px' }}>⚙️ Paramètres</h2>
         
         <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
           <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Nom complet</label>
              <input className="input-royal" value={fullName} onChange={e => setFullName(e.target.value)} required />
           </div>
           
           {/* Avatar Editor */}
           <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
               {avatarUrl ? <img src={avatarUrl} style={{ width: '48px', height: '48px', borderRadius: '24px', objectFit: 'cover' }} /> : <div style={{ width: '48px', height: '48px', borderRadius: '24px', background: 'var(--accent-royal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>📸</div>}
               <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                     const reader = new FileReader();
                     reader.onloadend = () => setAvatarUrl(reader.result as string);
                     reader.readAsDataURL(file);
                  }
               }} style={{ display: 'none' }} id="avatar-upload-web" />
               <label htmlFor="avatar-upload-web" style={{ cursor: 'pointer', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                  Modifier la photo...
               </label>
           </div>

           <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Nouveau Mot de passe (optionnel)</label>
              <input type="password" className="input-royal" value={password} onChange={e => setPassword(e.target.value)} placeholder="Laissez vide pour conserver" />
           </div>

           <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button type="button" className="btn-alt" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
              <button type="submit" className="btn-royal" style={{ flex: 1 }} disabled={saving}>
                {saving ? '⏳...' : 'Enregistrer'}
              </button>
           </div>
         </form>
       </div>
    </div>
  );
}
