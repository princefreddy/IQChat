import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { apiFetch } from '../../lib/api';

export default function Connect4({ message, currentUserId }: { message: any, currentUserId: string }) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    try {
      if (typeof message.content === 'string' && message.content.startsWith('{')) {
        setState(JSON.parse(message.content));
      }
    } catch(e) {}
  }, [message.content]);

  if (!state) return <Text style={{ color: 'red' }}>Invalid game state</Text>;

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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: JSON.stringify(newState) })
      });
    } catch(e) {}
  };

  return (
    <View style={{ marginTop: 8, backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333', width: 260 }}>
      <Text style={{ textAlign: 'center', marginBottom: 8, color: '#C5A03B', fontWeight: 'bold' }}>🔴🟡 Puissance 4</Text>
      
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 236, justifyContent: 'center', backgroundColor: '#2563eb', padding: 6, borderRadius: 8 }}>
        {state.board.map((cell: string, i: number) => (
          <TouchableOpacity 
            key={i} 
            onPress={() => handleColumnClick(i % 7)}
            activeOpacity={0.8}
            style={{ 
              width: 28,
              height: 28, 
              backgroundColor: cell === 'x' ? '#ef4444' : cell === 'o' ? '#fde047' : '#111D36', 
              margin: 2,
              borderRadius: 14,
            }}
          />
        ))}
      </View>
      
      <View style={{ marginTop: 8, alignItems: 'center' }}>
        {state.status === 'playing' && <Text style={{ color: '#888', fontSize: 12 }}>C'est au tour de {state.current_turn === 'x' ? '🔴 Rouge' : '🟡 Jaune'}</Text>}
        {state.status === 'won' && <Text style={{ color: '#4ade80', fontWeight: 'bold' }}>{state.winner === 'x' ? '🔴 Rouge' : '🟡 Jaune'} a gagné !</Text>}
        {state.status === 'draw' && <Text style={{ color: '#888' }}>Match nul !</Text>}
        {state.status === 'cancelled' && <Text style={{ color: '#ef4444' }}>Partie abandonnée</Text>}
      </View>
      
      {state.status === 'playing' && (
        <TouchableOpacity 
          onPress={handleQuit} 
          style={{ width: '100%', marginTop: 8, padding: 8, backgroundColor: 'rgba(239,68,68,0.2)', borderWidth: 1, borderColor: '#ef4444', borderRadius: 6, alignItems: 'center' }}
        >
          <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold' }}>🛑 Abandonner</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
