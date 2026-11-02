"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Icon from "../Icon";

export default function Connect4({ message, currentUserId }: { message: any; currentUserId: string }) {
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

  const renderDiscBadge = (player: string) => {
    const isRed = player === "x";
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: isRed ? "#ef4444" : "#fde047",
            display: "inline-block",
          }}
        />
        <span>{isRed ? "Rouge" : "Or"}</span>
      </span>
    );
  };

  return (
    <div
      style={{
        marginTop: "8px",
        background: "var(--bg-primary)",
        padding: "12px",
        borderRadius: "12px",
        border: "1px solid var(--border-glass)",
        width: "260px",
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
        <Icon name="disc" size={15} color="var(--accent-gold)" />
        <span>Puissance 4</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "4px",
          marginBottom: "10px",
          background: "#1d4ed8",
          padding: "6px",
          borderRadius: "8px",
        }}
      >
        {state.board.map((cell: string, i: number) => (
          <div
            key={i}
            onClick={() => handleColumnClick(i % 7)}
            style={{
              aspectRatio: "1",
              background: cell === "x" ? "#ef4444" : cell === "o" ? "#fde047" : "var(--bg-primary)",
              borderRadius: "50%",
              cursor: state.status === "playing" ? "pointer" : "default",
              boxShadow: cell ? "inset 0 -3px 0 rgba(0,0,0,0.3)" : "inset 0 3px 5px rgba(0,0,0,0.5)",
            }}
          />
        ))}
      </div>

      <div style={{ textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
        {state.status === "playing" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <span>Tour :</span>
            {renderDiscBadge(state.current_turn)}
          </div>
        )}
        {state.status === "won" && (
          <div style={{ color: "#4ade80", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            {renderDiscBadge(state.winner)}
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
