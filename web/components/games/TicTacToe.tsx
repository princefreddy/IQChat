import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function TicTacToe({ message, currentUserId }: { message: any, currentUserId: string }) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    try {
      if (typeof message.content === 'string' && message.content.startsWith('{')) {
        setState(JSON.parse(message.content));
      }
    } catch(e) {}
  }, [message.content]);

  if (!state) return <div>Invalid game state</div>;

  const handleCellClick = async (index: number) => {
    if (state.status !== 'playing') return;
    if (state.board[index] !== '') return;
    
    let player_x = state.player_x || message.sender_id;
    let player_o = state.player_o;
    
    if (!player_o && currentUserId !== player_x) {
      player_o = currentUserId;
    }

    const amIX = currentUserId === player_x;
    const amIO = currentUserId === player_o;
    
    if (state.current_turn === 'x' && !amIX) return;
    if (state.current_turn === 'o' && !amIO) return;
    
    const newBoard = [...state.board];
    newBoard[index] = state.current_turn;
    
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    let winner = null;
    for (let line of lines) {
      const [a, b, c] = line;
      if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) {
        winner = newBoard[a];
        break;
      }
    }
    
    let status = 'playing';
    if (winner) status = 'won';
    else if (!newBoard.includes('')) status = 'draw';
    
    const newState = {
      board: newBoard,
      player_x,
      player_o,
      current_turn: state.current_turn === 'x' ? 'o' : 'x',
      winner,
      status
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

  return (
    <div style={{ marginTop: '8px', background: 'var(--bg-primary)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-glass)', width: '200px' }}>
      <div style={{ textAlign: 'center', marginBottom: '8px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>🎮 Morpion</div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '8px' }}>
        {state.board.map((cell: string, i: number) => (
          <div 
            key={i} 
            onClick={() => handleCellClick(i)}
            style={{ 
              height: '50px', 
              background: 'var(--bg-glass)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '24px', 
              cursor: (state.status === 'playing' && cell === '') ? 'pointer' : 'default',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            {cell === 'x' ? '❌' : cell === 'o' ? '⭕' : ''}
          </div>
        ))}
      </div>
      
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {state.status === 'playing' && <div>C'est au tour de {state.current_turn === 'x' ? '❌' : '⭕'}</div>}
        {state.status === 'won' && <div style={{ color: '#4ade80', fontWeight: 'bold' }}>{state.winner === 'x' ? '❌' : '⭕'} a gagné !</div>}
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
