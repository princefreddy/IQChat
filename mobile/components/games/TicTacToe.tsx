import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { apiFetch } from '../../lib/api';

export default function TicTacToe({ message, currentUserId }: { message: any, currentUserId: string }) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    try {
      if (typeof message.content === 'string' && message.content.startsWith('{')) {
        setState(JSON.parse(message.content));
      }
    } catch(e) {}
  }, [message.content]);

  if (!state) return <Text style={{ color: 'red' }}>Invalid game state</Text>;

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
    
    setState(newState);
    
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
    <View style={{ marginTop: 8, backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333', width: 220 }}>
      <Text style={{ textAlign: 'center', marginBottom: 8, color: '#D4AF37', fontWeight: 'bold' }}>🎮 Morpion</Text>
      
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 196, justifyContent: 'center' }}>
        {state.board.map((cell: string, i: number) => (
          <TouchableOpacity 
            key={i} 
            onPress={() => handleCellClick(i)}
            activeOpacity={0.7}
            style={{ 
              width: 60,
              height: 60, 
              backgroundColor: 'rgba(255,255,255,0.05)', 
              justifyContent: 'center', 
              alignItems: 'center', 
              margin: 2,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)'
            }}
          >
            <Text style={{ fontSize: 28 }}>{cell === 'x' ? '❌' : cell === 'o' ? '⭕' : ''}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <View style={{ marginTop: 8, alignItems: 'center' }}>
        {state.status === 'playing' && <Text style={{ color: '#888', fontSize: 12 }}>C'est au tour de {state.current_turn === 'x' ? '❌' : '⭕'}</Text>}
        {state.status === 'won' && <Text style={{ color: '#4ade80', fontWeight: 'bold' }}>{state.winner === 'x' ? '❌' : '⭕'} a gagné !</Text>}
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
