import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function WordMystery({ message, currentUserId }: { message: any, currentUserId: string }) {
  const [state, setState] = useState<any>(null);
  const [guessInput, setGuessInput] = useState('');

  useEffect(() => {
    try {
      if (typeof message.content === 'string' && message.content.startsWith('{')) {
        setState(JSON.parse(message.content));
      }
    } catch(e) {}
  }, [message.content]);

  if (!state) return <div>Invalid game state</div>;

  const targetWord = state.target_word || '';
  const maxTries = 6;

  const handleGuess = async () => {
    if (state.status !== 'playing') return;
    if (guessInput.length !== targetWord.length) return;
    
    let player_x = state.player_x || message.sender_id;
    let player_o = state.player_o;
    
    // Assign player_o if not set
    if (!player_o && currentUserId !== player_x) {
      player_o = currentUserId;
    }

    const amIO = currentUserId === player_o;
    if (!amIO) return; // Only player O can guess
    
    const upperGuess = guessInput.toUpperCase();
    const newGuesses = [...(state.guesses || []), upperGuess];
    
    let status = 'playing';
    let winner = null;
    
    if (upperGuess === targetWord) {
      status = 'won';
      winner = 'o'; // Guesser won
    } else if (newGuesses.length >= maxTries) {
      status = 'lost';
      winner = 'x'; // Creator won (guesser failed)
    }
    
    const newState = {
      ...state,
      player_x,
      player_o,
      guesses: newGuesses,
      status,
      winner
    };
    
    setState(newState); // optimistic update
    setGuessInput('');
    
    try {
      await apiFetch(`/messages/${message.id}/content`, {
        method: 'PATCH',
        body: JSON.stringify({ content: JSON.stringify(newState) })
      });
    } catch(e) {}
  };

  const handleQuit = async () => {
    if (state.status !== 'playing') return;
    const newState = { ...state, status: 'cancelled' };
    setState(newState);
    try {
      await apiFetch(`/messages/${message.id}/content`, {
        method: 'PATCH',
        body: JSON.stringify({ content: JSON.stringify(newState) })
      });
    } catch(e) {}
  };

  const renderGuessLetters = (guess: string) => {
    const targetChars = targetWord.split('');
    const guessChars = guess.split('');
    
    // Simple evaluation (no advanced duplicate letter logic for simplicity here)
    return guessChars.map((char, i) => {
      let bgColor = 'var(--bg-glass)';
      let borderColor = 'var(--border-glass)';
      
      if (char === targetChars[i]) {
        bgColor = '#22c55e'; // Green
        borderColor = '#16a34a';
      } else if (targetChars.includes(char)) {
        bgColor = '#eab308'; // Yellow
        borderColor = '#ca8a04';
      }
      
      return (
        <div key={i} style={{ width: '32px', height: '32px', background: bgColor, border: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', borderRadius: '4px' }}>
          {char}
        </div>
      );
    });
  };

  const renderEmptyRow = () => {
    return Array(targetWord.length).fill('').map((_, i) => (
      <div key={`empty-${i}`} style={{ width: '32px', height: '32px', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '4px' }} />
    ));
  };

  const amIX = currentUserId === (state.player_x || message.sender_id);
  const amIO = state.player_o ? currentUserId === state.player_o : false;
  const canPlay = !amIX && (state.status === 'playing') && (!state.player_o || amIO);

  return (
    <div style={{ marginTop: '8px', background: 'var(--bg-primary)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-glass)', width: 'fit-content', minWidth: '220px' }}>
      <div style={{ textAlign: 'center', marginBottom: '8px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>🧠 Le Mot Mystère</div>
      
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '12px' }}>
        Mot de {targetWord.length} lettres
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', marginBottom: '16px' }}>
        {(state.guesses || []).map((guess: string, i: number) => (
          <div key={i} style={{ display: 'flex', gap: '6px' }}>
            {renderGuessLetters(guess)}
          </div>
        ))}
        
        {Array(Math.max(0, maxTries - (state.guesses?.length || 0))).fill(0).map((_, i) => (
          <div key={`rem-${i}`} style={{ display: 'flex', gap: '6px' }}>
            {renderEmptyRow()}
          </div>
        ))}
      </div>
      
      {canPlay && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <input 
            type="text" 
            maxLength={targetWord.length}
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value.toUpperCase())}
            placeholder="Votre essai..."
            style={{ flex: 1, background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '6px 8px', color: 'white', textTransform: 'uppercase', outline: 'none' }}
          />
          <button 
            onClick={handleGuess}
            disabled={guessInput.length !== targetWord.length}
            style={{ background: 'var(--accent-gold)', color: 'black', border: 'none', borderRadius: '6px', padding: '0 12px', fontWeight: 'bold', cursor: guessInput.length === targetWord.length ? 'pointer' : 'not-allowed', opacity: guessInput.length === targetWord.length ? 1 : 0.5 }}
          >
            ✓
          </button>
        </div>
      )}
      
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {state.status === 'playing' && (amIX ? <div>En attente de l'adversaire...</div> : <div>A vous de deviner !</div>)}
        {state.status === 'won' && <div style={{ color: '#4ade80', fontWeight: 'bold' }}>Le mot a été trouvé !</div>}
        {state.status === 'lost' && <div style={{ color: '#ef4444', fontWeight: 'bold' }}>Perdu ! Le mot était {targetWord}</div>}
        {state.status === 'cancelled' && <div style={{ color: '#ef4444' }}>Partie abandonnée</div>}
      </div>
      
      {state.status === 'playing' && (
        <button 
          onClick={handleQuit} 
          style={{ width: '100%', marginTop: '8px', padding: '6px', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
        >
          🛑 Abandonner
        </button>
      )}
    </div>
  );
}
