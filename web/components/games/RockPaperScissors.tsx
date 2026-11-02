"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Icon from "../Icon";

export default function RockPaperScissors({ message, currentUserId }: { message: any; currentUserId: string }) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    try {
      if (typeof message.content === "string" && message.content.startsWith("{")) {
        setState(JSON.parse(message.content));
      }
    } catch {}
  }, [message.content]);

  if (!state) return <div>État de jeu invalide</div>;

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

    let nextPlayerX = playerX;
    let nextPlayerO = playerO;

    if (!nextPlayerO && currentUserId !== nextPlayerX) {
      nextPlayerO = currentUserId;
    }

    const nowX = currentUserId === nextPlayerX;
    const nowO = currentUserId === nextPlayerO;

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
      player_x: nextPlayerX,
      player_o: nextPlayerO,
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
    if (!choice) return <Icon name="hourglass" size={24} color="var(--text-secondary)" />;
    if (isHidden) return <Icon name="lock" size={24} color="var(--accent-gold)" />;
    if (choice === "rock") return <Icon name="shield" size={24} color="#94a3b8" />;
    if (choice === "paper") return <Icon name="file" size={24} color="#e2e8f0" />;
    if (choice === "scissors") return <Icon name="scissors" size={24} color="var(--accent-gold)" />;
    return null;
  };

  return (
    <div
      style={{
        marginTop: "8px",
        background: "var(--bg-primary)",
        padding: "12px",
        borderRadius: "12px",
        border: "1px solid var(--border-glass)",
        width: "240px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          marginBottom: "12px",
          color: "var(--accent-gold)",
          fontWeight: 600,
          fontSize: "13px",
        }}
      >
        <Icon name="scissors" size={15} color="var(--accent-gold)" />
        <span>Pierre-Papier-Ciseaux</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Créateur</div>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "var(--bg-glass)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: "6px",
            }}
          >
            {renderChoice(state.player_x_choice, state.status === "playing" && !amIX)}
          </div>
        </div>

        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent-gold)" }}>VS</div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Adversaire</div>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "var(--bg-glass)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: "6px",
            }}
          >
            {renderChoice(state.player_o_choice, state.status === "playing" && !amIO)}
          </div>
        </div>
      </div>

      {state.status === "playing" && (amIX || !state.player_o || amIO) && (
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "10px" }}>
          {[
            { key: "rock", label: "Pierre", icon: "shield" as const },
            { key: "paper", label: "Papier", icon: "file" as const },
            { key: "scissors", label: "Ciseaux", icon: "scissors" as const },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleChoice(opt.key)}
              style={{
                flex: 1,
                background: "var(--bg-glass)",
                border: "1px solid var(--border-glass)",
                borderRadius: "8px",
                padding: "8px 4px",
                color: "white",
                fontSize: "11px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Icon name={opt.icon} size={16} color="var(--accent-gold)" />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
        {state.status === "playing" && <div>En attente des deux choix...</div>}
        {state.status === "won" && (
          <div style={{ color: "#4ade80", fontWeight: 600 }}>
            {state.winner === "x" ? "Le créateur" : "L'adversaire"} a gagné !
          </div>
        )}
        {state.status === "draw" && <div>Match nul</div>}
        {state.status === "cancelled" && <div style={{ color: "#ef4444" }}>Partie abandonnée</div>}
      </div>

      {state.status === "playing" && isParticipant && (
        <button
          type="button"
          onClick={handleQuit}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "6px",
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.5)",
            color: "#f87171",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          <Icon name="flag" size={13} color="#f87171" />
          <span>Abandonner</span>
        </button>
      )}
    </div>
  );
}
