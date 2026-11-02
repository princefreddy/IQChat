import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";

export default function TicTacToe({ message, currentUserId }: { message: any; currentUserId: string }) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    try {
      if (typeof message.content === "string" && message.content.startsWith("{")) {
        setState(JSON.parse(message.content));
      }
    } catch {}
  }, [message.content]);

  if (!state) return <Text style={{ color: "#f87171", fontSize: 12 }}>État de jeu invalide</Text>;

  const playerX = state.player_x || message.sender_id;
  const playerO = state.player_o;
  const amIX = currentUserId === playerX;
  const amIO = playerO ? currentUserId === playerO : false;
  const isParticipant = amIX || amIO;

  const handleCellClick = async (index: number) => {
    if (state.status !== "playing") return;
    if (state.board[index] !== "") return;

    let nextX = playerX;
    let nextO = playerO;
    if (!nextO && currentUserId !== nextX) nextO = currentUserId;

    const nowX = currentUserId === nextX;
    const nowO = currentUserId === nextO;

    if (state.current_turn === "x" && !nowX) return;
    if (state.current_turn === "o" && !nowO) return;

    const newBoard = [...state.board];
    newBoard[index] = state.current_turn;

    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    let winner = null;
    for (const [a, b, c] of lines) {
      if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) {
        winner = newBoard[a];
        break;
      }
    }

    let status = "playing";
    if (winner) status = "won";
    else if (!newBoard.includes("")) status = "draw";

    const newState = {
      board: newBoard,
      player_x: nextX,
      player_o: nextO,
      current_turn: state.current_turn === "x" ? "o" : "x",
      winner,
      status,
    };

    setState(newState);

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

  const renderMark = (mark: string, size = 24) => {
    if (mark === "x") return <Feather name="x" size={size} color="#f87171" />;
    if (mark === "o") {
      return (
        <View
          style={{
            width: size - 4,
            height: size - 4,
            borderRadius: (size - 4) / 2,
            borderWidth: 2.5,
            borderColor: "#38bdf8",
          }}
        />
      );
    }
    return null;
  };

  return (
    <View style={{ marginTop: 6, backgroundColor: "rgba(10,17,40,0.65)", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", width: 216 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
        <Feather name="grid" size={14} color="#C5A03B" />
        <Text style={{ color: "#C5A03B", fontWeight: "700", fontSize: 13 }}>Morpion</Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", width: 192, justifyContent: "center" }}>
        {state.board.map((cell: string, i: number) => (
          <TouchableOpacity
            key={i}
            onPress={() => handleCellClick(i)}
            activeOpacity={0.75}
            style={{
              width: 58,
              height: 58,
              backgroundColor: "rgba(255,255,255,0.05)",
              justifyContent: "center",
              alignItems: "center",
              margin: 2,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
            }}
          >
            {renderMark(cell, 26)}
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ marginTop: 8, alignItems: "center" }}>
        {state.status === "playing" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: "#94A3B8", fontSize: 12 }}>Tour de</Text>
            {renderMark(state.current_turn, 15)}
          </View>
        )}
        {state.status === "won" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {renderMark(state.winner, 15)}
            <Text style={{ color: "#4ade80", fontWeight: "700", fontSize: 12 }}>a gagné !</Text>
          </View>
        )}
        {state.status === "draw" && <Text style={{ color: "#94A3B8", fontSize: 12 }}>Match nul</Text>}
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
