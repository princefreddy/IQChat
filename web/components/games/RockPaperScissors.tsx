import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function RockPaperScissors({ message, currentUserId }: { message: any, currentUserId: string }) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    try {
      if (typeof message.content === 'string' && message.content.startsWith('{')) {
        setState(JSON.parse(message.content));
      }
    } catch(e) {}
  }, [message.content]);

  if (!state) return <div>Invalid game state</div>;

  const determineWinner = (choiceX: string, choiceO: string) => {
    if (choiceX === choiceO) return 'draw';
    if (
      (choiceX === 'rock' && choiceO === 'scissors') ||
      (choiceX === 'paper' && choiceO === 'rock') ||
      (choiceX === 'scissors' && choiceO === 'paper')
    ) return 'x';
    return 'o';
  };

  const handleChoice = async (choice: string) => {
    if (state.status !== 'playing') return;
    
    let player_x = state.player_x || message.sender_id;
    let player_o = state.player_o;
    
    // Assign player_o if not set
    if (!player_o && currentUserId !== player_x) {
      player_o = currentUserId;
    }

    const amIX = currentUserId === player_x;
    const amIO = currentUserId === player_o;
    
    if (!amIX && !amIO) return; // Spectator
    
    let pxChoice = state.player_x_choice;
    let poChoice = state.player_o_choice;
    
    if (amIX && !pxChoice) pxChoice = choice;
    if (amIO && !poChoice) poChoice = choice;
    
    if (pxChoice === state.player_x_choice && poChoice === state.player_o_choice) return; // No change
    
    let status = 'playing';
    let winner = null;
    
    if (pxChoice && poChoice) {
      const result = determineWinner(pxChoice, poChoice);
      if (result === 'draw') status = 'draw';
      else {
        status = 'won';
        winner = result;
      }
    }
    
    const newState = {
      ...state,
      player_x,
      player_o,
      player_x_choice: pxChoice,
      player_o_choice: poChoice,
      status,
      winner
    };
    
    setState(newState); // optimistic update
    
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

  const renderChoice = (choice: string | null, isHidden: boolean) => {
    if (!choice) return '⏳';
    if (isHidden) return '🔒';
    if (choice === 'rock') return '🪨';
    if (choice === 'paper') return '📄';
    if (choice === 'scissors') return '✂️';
    return '';
  };

  const amIX = currentUserId === (state.player_x || message.sender_id);
  const amIO = state.player_o ? currentUserId === state.player_o : false;

  return (
    <div style={{ marginTop: '8px', background: 'var(--bg-primary)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-glass)', width: '220px' }}>
      <div style={{ textAlign: 'center', marginBottom: '12px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>✂️ Pierre-Papier-Ciseaux</div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Créateur</div>
          <div style={{ fontSize: '32px', margin: '8px 0' }}>
            {renderChoice(state.player_x_choice, state.status === 'playing' && !amIX)}
          </div>
        </div>
        
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>VS</div>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Adversaire</div>
          <div style={{ fontSize: '32px', margin: '8px 0' }}>
            {renderChoice(state.player_o_choice, state.status === 'playing' && !amIO)}
          </div>
        </div>
      </div>
      
      {state.status === 'playing' && (amIX || (!state.player_o || amIO)) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          <button onClick={() => handleChoice('rock')} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '8px', fontSize: '20px', cursor: 'pointer' }}>🪨</button>
          <button onClick={() => handleChoice('paper')} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '8px', fontSize: '20px', cursor: 'pointer' }}>📄</button>
          <button onClick={() => handleChoice('scissors')} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '8px', fontSize: '20px', cursor: 'pointer' }}>✂️</button>
        </div>
      )}
      
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {state.status === 'playing' && <div>En attente de choix...</div>}
        {state.status === 'won' && <div style={{ color: '#4ade80', fontWeight: 'bold' }}>{state.winner === 'x' ? 'Créateur' : 'Adversaire'} a gagné !</div>}
        {state.status === 'draw' && <div>Match nul !</div>}
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
