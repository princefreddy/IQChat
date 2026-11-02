import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";

export default function Connect4({ message, currentUserId }: { message: any; currentUserId: string }) {
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

  const checkWinner = (board: string[]) => {
    const cols = 7;
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 3; c++) {
        const i = r * cols + c;
        if (board[i] && board[i] === board[i + 1] && board[i] === board[i + 2] && board[i] === board[i + 3]) return board[i];
      }
    }
    for (let r = 0; r < rows - 3; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (board[i] && board[i] === board[i + cols] && board[i] === board[i + cols * 2] && board[i] === board[i + cols * 3]) return board[i];
      }
    }
    for (let r = 0; r < rows - 3; r++) {
      for (let c = 0; c < cols - 3; c++) {
        const i = r * cols + c;
        if (board[i] && board[i] === board[i + cols + 1] && board[i] === board[i + (cols + 1) * 2] && board[i] === board[i + (cols + 1) * 3]) return board[i];
      }
    }
    for (let r = 0; r < rows - 3; r++) {
      for (let c = 3; c < cols; c++) {
        const i = r * cols + c;
        if (board[i] && board[i] === board[i + cols - 1] && board[i] === board[i + (cols - 1) * 2] && board[i] === board[i + (cols - 1) * 3]) return board[i];
      }
    }
    return null;
  };

  const handleColumnClick = async (colIndex: number) => {
    if (state.status !== "playing") return;

    let nextX = playerX;
    let nextO = playerO;
    if (!nextO && currentUserId !== nextX) nextO = currentUserId;

    const nowX = currentUserId === nextX;
    const nowO = currentUserId === nextO;
    if (state.current_turn === "x" && !nowX) return;
    if (state.current_turn === "o" && !nowO) return;

    const newBoard = [...state.board];
    const cols = 7;
    const rows = 6;
    let placedRow = -1;
    for (let r = rows - 1; r >= 0; r--) {
      const idx = r * cols + colIndex;
      if (newBoard[idx] === "") {
        newBoard[idx] = state.current_turn;
        placedRow = r;
        break;
      }
    }
    if (placedRow === -1) return;

    const winner = checkWinner(newBoard);
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

  const renderBadge = (p: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p === "x" ? "#ef4444" : "#fde047" }} />
      <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "600" }}>{p === "x" ? "Rouge" : "Or"}</Text>
    </View>
  );

  return (
    <View style={{ marginTop: 6, backgroundColor: "rgba(10,17,40,0.65)", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", width: 256 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
        <Feather name="disc" size={14} color="#C5A03B" />
        <Text style={{ color: "#C5A03B", fontWeight: "700", fontSize: 13 }}>Puissance 4</Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", width: 232, justifyContent: "center", backgroundColor: "#1d4ed8", padding: 5, borderRadius: 8 }}>
        {state.board.map((cell: string, i: number) => (
          <TouchableOpacity
            key={i}
            onPress={() => handleColumnClick(i % 7)}
            activeOpacity={0.8}
            style={{
              width: 27,
              height: 27,
              backgroundColor: cell === "x" ? "#ef4444" : cell === "o" ? "#fde047" : "#0A1128",
              margin: 2,
              borderRadius: 14,
            }}
          />
        ))}
      </View>

      <View style={{ marginTop: 8, alignItems: "center" }}>
        {state.status === "playing" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: "#94A3B8", fontSize: 12 }}>Tour :</Text>
            {renderBadge(state.current_turn)}
          </View>
        )}
        {state.status === "won" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {renderBadge(state.winner)}
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
