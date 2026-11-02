import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";

export default function WordMystery({ message, currentUserId }: { message: any; currentUserId: string }) {
  const [state, setState] = useState<any>(null);
  const [guessInput, setGuessInput] = useState("");

  useEffect(() => {
    try {
      if (typeof message.content === "string" && message.content.startsWith("{")) {
        setState(JSON.parse(message.content));
      }
    } catch {}
  }, [message.content]);

  if (!state) return <Text style={{ color: "#f87171", fontSize: 12 }}>État de jeu invalide</Text>;

  const targetWord = state.target_word || "";
  const maxTries = 6;
  const playerX = state.player_x || message.sender_id;
  const playerO = state.player_o;
  const amIX = currentUserId === playerX;
  const amIO = playerO ? currentUserId === playerO : false;
  const isParticipant = amIX || amIO;
  const canPlay = !amIX && state.status === "playing" && (!playerO || amIO);

  const handleGuess = async () => {
    if (state.status !== "playing") return;
    if (guessInput.length !== targetWord.length) return;

    let nextX = playerX;
    let nextO = playerO;
    if (!nextO && currentUserId !== nextX) nextO = currentUserId;
    if (currentUserId !== nextO) return;

    const upperGuess = guessInput.toUpperCase();
    const newGuesses = [...(state.guesses || []), upperGuess];

    let status = "playing";
    let winner = null;
    if (upperGuess === targetWord) {
      status = "won";
      winner = "o";
    } else if (newGuesses.length >= maxTries) {
      status = "lost";
      winner = "x";
    }

    const newState = {
      ...state,
      player_x: nextX,
      player_o: nextO,
      guesses: newGuesses,
      status,
      winner,
    };

    setState(newState);
    setGuessInput("");

    try {
      await apiFetch(`/messages/${message.id}/content`, {
        method: "PATCH",
        body: JSON.stringify({ content: JSON.stringify(newState) }),
      });
    } catch {}
  };

  const handleQuit = async () => {
    if (state.status !== "playing" || !isParticipant) return;
    const newState = { ...state, status: "cancelled" };
    setState(newState);
    try {
      await apiFetch(`/messages/${message.id}/content`, {
        method: "PATCH",
        body: JSON.stringify({ content: JSON.stringify(newState) }),
      });
    } catch {}
  };

  const renderGuessLetters = (guess: string) => {
    const targetChars = targetWord.split("");
    return guess.split("").map((char, i) => {
      let bgColor = "rgba(255,255,255,0.05)";
      let borderColor = "rgba(255,255,255,0.12)";
      if (char === targetChars[i]) {
        bgColor = "#22c55e";
        borderColor = "#16a34a";
      } else if (targetChars.includes(char)) {
        bgColor = "#eab308";
        borderColor = "#ca8a04";
      }
      return (
        <View
          key={i}
          style={{
            width: 30,
            height: 30,
            backgroundColor: bgColor,
            borderWidth: 1,
            borderColor,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 5,
          }}
        >
          <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>{char}</Text>
        </View>
      );
    });
  };

  const renderEmptyRow = () =>
    Array(targetWord.length)
      .fill("")
      .map((_, i) => (
        <View
          key={`empty-${i}`}
          style={{
            width: 30,
            height: 30,
            backgroundColor: "rgba(255,255,255,0.04)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.1)",
            borderRadius: 5,
          }}
        />
      ));

  return (
    <View style={{ marginTop: 6, backgroundColor: "rgba(10,17,40,0.65)", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", minWidth: 230 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
        <Feather name="help-circle" size={14} color="#C5A03B" />
        <Text style={{ color: "#C5A03B", fontWeight: "700", fontSize: 13 }}>Le Mot Mystère</Text>
      </View>

      <Text style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginBottom: 10 }}>
        Mot de {targetWord.length} lettres
      </Text>

      <View style={{ gap: 5, alignItems: "center", marginBottom: 12 }}>
        {(state.guesses || []).map((guess: string, i: number) => (
          <View key={i} style={{ flexDirection: "row", gap: 5 }}>
            {renderGuessLetters(guess)}
          </View>
        ))}

        {Array(Math.max(0, maxTries - (state.guesses?.length || 0)))
          .fill(0)
          .map((_, i) => (
            <View key={`rem-${i}`} style={{ flexDirection: "row", gap: 5 }}>
              {renderEmptyRow()}
            </View>
          ))}
      </View>

      {canPlay && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          <TextInput
            maxLength={targetWord.length}
            value={guessInput}
            onChangeText={(t) => setGuessInput(t.toUpperCase())}
            placeholder="Votre essai..."
            placeholderTextColor="#64748B"
            autoCapitalize="characters"
            style={{
              flex: 1,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              color: "#FFF",
              fontSize: 13,
            }}
          />
          <TouchableOpacity
            onPress={handleGuess}
            disabled={guessInput.length !== targetWord.length}
            style={{
              backgroundColor: guessInput.length === targetWord.length ? "#C5A03B" : "rgba(255,255,255,0.15)",
              borderRadius: 6,
              paddingHorizontal: 12,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Feather name="check" size={16} color="#0A1128" />
          </TouchableOpacity>
        </View>
      )}

      <View style={{ alignItems: "center" }}>
        {state.status === "playing" && (
          <Text style={{ color: "#94A3B8", fontSize: 12 }}>
            {amIX ? "En attente de l'adversaire..." : "À vous de deviner"}
          </Text>
        )}
        {state.status === "won" && <Text style={{ color: "#4ade80", fontWeight: "700", fontSize: 12 }}>Mot trouvé !</Text>}
        {state.status === "lost" && <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 12 }}>Perdu ! Le mot était {targetWord}</Text>}
        {state.status === "cancelled" && <Text style={{ color: "#ef4444", fontSize: 12 }}>Partie abandonnée</Text>}
      </View>

      {state.status === "playing" && isParticipant && (
        <TouchableOpacity
          onPress={handleQuit}
          style={{
            width: "100%",
            marginTop: 8,
            paddingVertical: 7,
            backgroundColor: "rgba(239,68,68,0.15)",
            borderWidth: 1,
            borderColor: "rgba(239,68,68,0.5)",
            borderRadius: 6,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Feather name="flag" size={12} color="#f87171" />
          <Text style={{ color: "#f87171", fontSize: 12, fontWeight: "600" }}>Abandonner</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
