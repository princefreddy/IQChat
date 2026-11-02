"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Icon from "../Icon";

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

  if (!state) return <div>État de jeu invalide</div>;

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

    let nextPlayerX = playerX;
    let nextPlayerO = playerO;

    if (!nextPlayerO && currentUserId !== nextPlayerX) {
      nextPlayerO = currentUserId;
    }

    if (currentUserId !== nextPlayerO) return;

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
      player_x: nextPlayerX,
      player_o: nextPlayerO,
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
      let bgColor = "var(--bg-glass)";
      let borderColor = "var(--border-glass)";
      if (char === targetChars[i]) {
        bgColor = "#22c55e";
        borderColor = "#16a34a";
      } else if (targetChars.includes(char)) {
        bgColor = "#eab308";
        borderColor = "#ca8a04";
      }
      return (
        <div
          key={i}
          style={{
            width: "30px",
            height: "30px",
            background: bgColor,
            border: `1px solid ${borderColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            borderRadius: "5px",
            fontSize: "13px",
          }}
        >
          {char}
        </div>
      );
    });
  };

  const renderEmptyRow = () =>
    Array(targetWord.length)
      .fill("")
      .map((_, i) => (
        <div
          key={`empty-${i}`}
          style={{
            width: "30px",
            height: "30px",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-glass)",
            borderRadius: "5px",
          }}
        />
      ));

  return (
    <div
      style={{
        marginTop: "8px",
        background: "var(--bg-primary)",
        padding: "12px",
        borderRadius: "12px",
        border: "1px solid var(--border-glass)",
        width: "fit-content",
        minWidth: "220px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          marginBottom: "6px",
          color: "var(--accent-gold)",
          fontWeight: 600,
          fontSize: "13px",
        }}
      >
        <Icon name="help-circle" size={15} color="var(--accent-gold)" />
        <span>Le Mot Mystère</span>
      </div>

      <div style={{ fontSize: "11px", color: "var(--text-secondary)", textAlign: "center", marginBottom: "10px" }}>
        Mot de {targetWord.length} lettres
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "center", marginBottom: "14px" }}>
        {(state.guesses || []).map((guess: string, i: number) => (
          <div key={i} style={{ display: "flex", gap: "5px" }}>
            {renderGuessLetters(guess)}
          </div>
        ))}

        {Array(Math.max(0, maxTries - (state.guesses?.length || 0)))
          .fill(0)
          .map((_, i) => (
            <div key={`rem-${i}`} style={{ display: "flex", gap: "5px" }}>
              {renderEmptyRow()}
            </div>
          ))}
      </div>

      {canPlay && (
        <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
          <input
            type="text"
            maxLength={targetWord.length}
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && guessInput.length === targetWord.length) {
                e.preventDefault();
                handleGuess();
              }
            }}
            placeholder="Votre essai..."
            style={{
              flex: 1,
              background: "var(--bg-glass)",
              border: "1px solid var(--border-glass)",
              borderRadius: "6px",
              padding: "6px 8px",
              color: "white",
              textTransform: "uppercase",
              outline: "none",
              fontSize: "13px",
            }}
          />
          <button
            type="button"
            onClick={handleGuess}
            disabled={guessInput.length !== targetWord.length}
            style={{
              background: "var(--accent-gold)",
              color: "black",
              border: "none",
              borderRadius: "6px",
              padding: "0 12px",
              fontWeight: 700,
              cursor: guessInput.length === targetWord.length ? "pointer" : "not-allowed",
              opacity: guessInput.length === targetWord.length ? 1 : 0.45,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="check" size={16} color="black" strokeWidth={2.5} />
          </button>
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
        {state.status === "playing" && (amIX ? <div>En attente de l&apos;adversaire...</div> : <div>À vous de deviner</div>)}
        {state.status === "won" && <div style={{ color: "#4ade80", fontWeight: 600 }}>Mot trouvé !</div>}
        {state.status === "lost" && <div style={{ color: "#ef4444", fontWeight: 600 }}>Perdu ! Le mot était {targetWord}</div>}
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
