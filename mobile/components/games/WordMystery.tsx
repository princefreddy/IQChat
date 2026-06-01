import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { apiFetch } from '../../lib/api';

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

  if (!state) return <Text style={{ color: 'red' }}>Invalid game state</Text>;

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

  const renderGuessLetters = (guess: string) => {
    const targetChars = targetWord.split('');
    const guessChars = guess.split('');
    
    return guessChars.map((char, i) => {
      let bgColor = 'rgba(255,255,255,0.05)';
      let borderColor = '#333';
      
      if (char === targetChars[i]) {
        bgColor = '#22c55e'; // Green
        borderColor = '#16a34a';
      } else if (targetChars.includes(char)) {
        bgColor = '#eab308'; // Yellow
        borderColor = '#ca8a04';
      }
      
      return (
        <View key={i} style={{ width: 32, height: 32, backgroundColor: bgColor, borderWidth: 1, borderColor, alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
          <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{char}</Text>
        </View>
      );
    });
  };

  const renderEmptyRow = () => {
    return Array(targetWord.length).fill('').map((_, i) => (
      <View key={`empty-${i}`} style={{ width: 32, height: 32, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#333', borderRadius: 4 }} />
    ));
  };

  const amIX = currentUserId === (state.player_x || message.sender_id);
  const amIO = state.player_o ? currentUserId === state.player_o : false;
  const canPlay = !amIX && (state.status === 'playing') && (!state.player_o || amIO);

  return (
    <View style={{ marginTop: 8, backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333', minWidth: 240 }}>
      <Text style={{ textAlign: 'center', marginBottom: 8, color: '#D4AF37', fontWeight: 'bold' }}>🧠 Le Mot Mystère</Text>
      
      <Text style={{ fontSize: 12, color: '#888', textAlign: 'center', marginBottom: 12 }}>
        Mot de {targetWord.length} lettres
      </Text>
      
      <View style={{ gap: 6, alignItems: 'center', marginBottom: 16 }}>
        {(state.guesses || []).map((guess: string, i: number) => (
          <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
            {renderGuessLetters(guess)}
          </View>
        ))}
        
        {Array(Math.max(0, maxTries - (state.guesses?.length || 0))).fill(0).map((_, i) => (
          <View key={`rem-${i}`} style={{ flexDirection: 'row', gap: 6 }}>
            {renderEmptyRow()}
          </View>
        ))}
      </View>
      
      {canPlay && (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <TextInput 
            maxLength={targetWord.length}
            value={guessInput}
            onChangeText={(t) => setGuessInput(t.toUpperCase())}
            placeholder="Votre essai..."
            placeholderTextColor="#888"
            autoCapitalize="characters"
            style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#333', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, color: '#FFF' }}
          />
          <TouchableOpacity 
            onPress={handleGuess}
            disabled={guessInput.length !== targetWord.length}
            style={{ backgroundColor: guessInput.length === targetWord.length ? '#D4AF37' : '#555', borderRadius: 6, paddingHorizontal: 12, justifyContent: 'center' }}
          >
            <Text style={{ color: '#000', fontWeight: 'bold' }}>✓</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <View style={{ alignItems: 'center' }}>
        {state.status === 'playing' && (amIX ? <Text style={{ color: '#888', fontSize: 12 }}>En attente de l'adversaire...</Text> : <Text style={{ color: '#888', fontSize: 12 }}>A vous de deviner !</Text>)}
        {state.status === 'won' && <Text style={{ color: '#4ade80', fontWeight: 'bold' }}>Le mot a été trouvé !</Text>}
        {state.status === 'lost' && <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>Perdu ! Le mot était {targetWord}</Text>}
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
