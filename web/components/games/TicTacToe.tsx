"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Icon from "../Icon";

export default function TicTacToe({ message, currentUserId }: { message: any; currentUserId: string }) {
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

  const handleCellClick = async (index: number) => {
    if (state.status !== "playing") return;
    if (state.board[index] !== "") return;

    let nextPlayerX = playerX;
    let nextPlayerO = playerO;

    if (!nextPlayerO && currentUserId !== nextPlayerX) {
      nextPlayerO = currentUserId;
    }

    const nowX = currentUserId === nextPlayerX;
    const nowO = currentUserId === nextPlayerO;

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
      player_x: nextPlayerX,
      player_o: nextPlayerO,
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

  const renderMark = (mark: string, size = 22) => {
    if (mark === "x") {
      return <Icon name="x" size={size} color="#f87171" strokeWidth={2.8} />;
    }
    if (mark === "o") {
      return (
        <span
          style={{
            display: "inline-block",
            width: size - 4,
            height: size - 4,
            borderRadius: "50%",
            border: "2.8px solid #38bdf8",
            verticalAlign: "middle",
          }}
        />
      );
    }
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
        width: "210px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          marginBottom: "10px",
          color: "var(--accent-gold)",
          fontWeight: 600,
          fontSize: "13px",
        }}
      >
        <Icon name="grid" size={15} color="var(--accent-gold)" />
        <span>Morpion</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "5px", marginBottom: "10px" }}>
        {state.board.map((cell: string, i: number) => (
          <div
            key={i}
            onClick={() => handleCellClick(i)}
            style={{
              height: "52px",
              background: "var(--bg-glass)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: state.status === "playing" && cell === "" ? "pointer" : "default",
              borderRadius: "6px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {renderMark(cell, 24)}
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
        {state.status === "playing" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <span>Tour de</span>
            {renderMark(state.current_turn, 15)}
          </div>
        )}
        {state.status === "won" && (
          <div style={{ color: "#4ade80", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            {renderMark(state.winner, 15)}
            <span>a gagné !</span>
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
