import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";

export default function RockPaperScissors({ message, currentUserId }: { message: any; currentUserId: string }) {
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

  const determineWinner = (choiceX: string, choiceO: string) => {
    if (choiceX === choiceO) return "draw";
    if (
      (choiceX === "rock" && choiceO === "scissors") ||
      (choiceX === "paper" && choiceO === "rock") ||
      (choiceX === "scissors" && choiceO === "paper")
    )
      return "x";
    return "o";
  };

  const handleChoice = async (choice: string) => {
    if (state.status !== "playing") return;
    let nextX = playerX;
    let nextO = playerO;
    if (!nextO && currentUserId !== nextX) nextO = currentUserId;

    const nowX = currentUserId === nextX;
    const nowO = currentUserId === nextO;
    if (!nowX && !nowO) return;

    let pxChoice = state.player_x_choice;
    let poChoice = state.player_o_choice;
    if (nowX && !pxChoice) pxChoice = choice;
    if (nowO && !poChoice) poChoice = choice;
    if (pxChoice === state.player_x_choice && poChoice === state.player_o_choice) return;

    let status = "playing";
    let winner = null;
    if (pxChoice && poChoice) {
      const result = determineWinner(pxChoice, poChoice);
      if (result === "draw") status = "draw";
      else {
        status = "won";
        winner = result;
      }
    }

    const newState = {
      ...state,
      player_x: nextX,
      player_o: nextO,
      player_x_choice: pxChoice,
      player_o_choice: poChoice,
      status,
      winner,
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

  const renderChoice = (choice: string | null, isHidden: boolean) => {
    if (!choice) return <Feather name="clock" size={22} color="#94A3B8" />;
    if (isHidden) return <Feather name="lock" size={22} color="#C5A03B" />;
    if (choice === "rock") return <Feather name="shield" size={22} color="#94A3B8" />;
    if (choice === "paper") return <Feather name="file-text" size={22} color="#E2E8F0" />;
    if (choice === "scissors") return <Feather name="scissors" size={22} color="#C5A03B" />;
    return null;
  };

  return (
    <View style={{ marginTop: 6, backgroundColor: "rgba(10,17,40,0.65)", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", width: 236 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10 }}>
        <Feather name="scissors" size={14} color="#C5A03B" />
        <Text style={{ color: "#C5A03B", fontWeight: "700", fontSize: 13 }}>Pierre-Papier-Ciseaux</Text>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center", marginBottom: 12 }}>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 11, color: "#94A3B8" }}>Créateur</Text>
          <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
            {renderChoice(state.player_x_choice, state.status === "playing" && !amIX)}
          </View>
        </View>

        <Text style={{ fontSize: 14, fontWeight: "700", color: "#C5A03B" }}>VS</Text>

        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 11, color: "#94A3B8" }}>Adversaire</Text>
          <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
            {renderChoice(state.player_o_choice, state.status === "playing" && !amIO)}
          </View>
        </View>
      </View>

      {state.status === "playing" && (amIX || !state.player_o || amIO) && (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 8 }}>
          {[
            { key: "rock", label: "Pierre", icon: "shield" as const },
            { key: "paper", label: "Papier", icon: "file-text" as const },
            { key: "scissors", label: "Ciseaux", icon: "scissors" as const },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => handleChoice(opt.key)}
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                borderRadius: 8,
                paddingVertical: 8,
                alignItems: "center",
                gap: 4,
              }}
            >
              <Feather name={opt.icon} size={16} color="#C5A03B" />
              <Text style={{ color: "#FFF", fontSize: 10 }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ alignItems: "center" }}>
        {state.status === "playing" && <Text style={{ color: "#94A3B8", fontSize: 12 }}>En attente des deux choix...</Text>}
        {state.status === "won" && (
          <Text style={{ color: "#4ade80", fontWeight: "700", fontSize: 12 }}>
            {state.winner === "x" ? "Le créateur" : "L'adversaire"} a gagné !
          </Text>
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
