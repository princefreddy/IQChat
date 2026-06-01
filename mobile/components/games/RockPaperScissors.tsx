import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { apiFetch } from '../../lib/api';

export default function RockPaperScissors({ message, currentUserId }: { message: any, currentUserId: string }) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    try {
      if (typeof message.content === 'string' && message.content.startsWith('{')) {
        setState(JSON.parse(message.content));
      }
    } catch(e) {}
  }, [message.content]);

  if (!state) return <Text style={{ color: 'red' }}>Invalid game state</Text>;

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
    <View style={{ marginTop: 8, backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333', width: 240 }}>
      <Text style={{ textAlign: 'center', marginBottom: 12, color: '#D4AF37', fontWeight: 'bold' }}>✂️ Pierre-Papier-Ciseaux</Text>
      
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#888' }}>Créateur</Text>
          <Text style={{ fontSize: 32, marginVertical: 8 }}>
            {renderChoice(state.player_x_choice, state.status === 'playing' && !amIX)}
          </Text>
        </View>
        
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#D4AF37' }}>VS</Text>
        
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#888' }}>Adversaire</Text>
          <Text style={{ fontSize: 32, marginVertical: 8 }}>
            {renderChoice(state.player_o_choice, state.status === 'playing' && !amIO)}
          </Text>
        </View>
      </View>
      
      {state.status === 'playing' && (amIX || (!state.player_o || amIO)) && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <TouchableOpacity onPress={() => handleChoice('rock')} style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 8 }}>
             <Text style={{ fontSize: 24 }}>🪨</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleChoice('paper')} style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 8 }}>
             <Text style={{ fontSize: 24 }}>📄</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleChoice('scissors')} style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 8 }}>
             <Text style={{ fontSize: 24 }}>✂️</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <View style={{ marginTop: 8, alignItems: 'center' }}>
        {state.status === 'playing' && <Text style={{ color: '#888', fontSize: 12 }}>En attente de choix...</Text>}
        {state.status === 'won' && <Text style={{ color: '#4ade80', fontWeight: 'bold' }}>{state.winner === 'x' ? 'Créateur' : 'Adversaire'} a gagné !</Text>}
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
