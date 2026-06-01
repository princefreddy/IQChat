import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export default function Connect4({ message, currentUserId }: { message: any, currentUserId: string }) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    try {
      if (typeof message.content === 'string' && message.content.startsWith('{')) {
        setState(JSON.parse(message.content));
      }
    } catch(e) {}
  }, [message.content]);

  if (!state) return <div>Invalid game state</div>;

  const checkWinner = (board: string[]) => {
    const cols = 7;
    const rows = 6;
    
    // Check horizontal
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 3; c++) {
        const i = r * cols + c;
        if (board[i] && board[i] === board[i+1] && board[i] === board[i+2] && board[i] === board[i+3]) return board[i];
      }
    }
    // Check vertical
    for (let r = 0; r < rows - 3; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (board[i] && board[i] === board[i+cols] && board[i] === board[i+cols*2] && board[i] === board[i+cols*3]) return board[i];
      }
    }
    // Check diagonal right
    for (let r = 0; r < rows - 3; r++) {
      for (let c = 0; c < cols - 3; c++) {
        const i = r * cols + c;
        if (board[i] && board[i] === board[i+cols+1] && board[i] === board[i+(cols+1)*2] && board[i] === board[i+(cols+1)*3]) return board[i];
      }
    }
    // Check diagonal left
    for (let r = 0; r < rows - 3; r++) {
      for (let c = 3; c < cols; c++) {
        const i = r * cols + c;
        if (board[i] && board[i] === board[i+cols-1] && board[i] === board[i+(cols-1)*2] && board[i] === board[i+(cols-1)*3]) return board[i];
      }
    }
    return null;
  };

  const handleColumnClick = async (colIndex: number) => {
    if (state.status !== 'playing') return;
    
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
    const cols = 7;
    const rows = 6;
    
    // Find lowest empty slot in column
    let placedRow = -1;
    for (let r = rows - 1; r >= 0; r--) {
      const idx = r * cols + colIndex;
      if (newBoard[idx] === '') {
        newBoard[idx] = state.current_turn;
        placedRow = r;
        break;
      }
    }
    
    if (placedRow === -1) return; // Column full
    
    const winner = checkWinner(newBoard);
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
    <div style={{ marginTop: '8px', background: 'var(--bg-primary)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-glass)', width: '260px' }}>
      <div style={{ textAlign: 'center', marginBottom: '8px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>🔴🟡 Puissance 4</div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px', background: '#2563eb', padding: '6px', borderRadius: '8px' }}>
        {state.board.map((cell: string, i: number) => (
          <div 
            key={i} 
            onClick={() => handleColumnClick(i % 7)}
            style={{ 
              aspectRatio: '1', 
              background: cell === 'x' ? '#ef4444' : cell === 'o' ? '#fde047' : 'var(--bg-primary)', 
              borderRadius: '50%',
              cursor: (state.status === 'playing') ? 'pointer' : 'default',
              boxShadow: cell ? 'inset 0 -3px 0 rgba(0,0,0,0.3)' : 'inset 0 3px 5px rgba(0,0,0,0.5)'
            }}
          />
        ))}
      </div>
      
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {state.status === 'playing' && <div>C'est au tour de {state.current_turn === 'x' ? '🔴 Rouge' : '🟡 Jaune'}</div>}
        {state.status === 'won' && <div style={{ color: '#4ade80', fontWeight: 'bold' }}>{state.winner === 'x' ? '🔴 Rouge' : '🟡 Jaune'} a gagné !</div>}
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
