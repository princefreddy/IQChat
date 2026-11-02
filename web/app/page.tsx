"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setAuthData, getAuthData, BASE_URL, fetchWithRetry } from "@/lib/api";
import Icon from "@/components/Icon";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    const auth = getAuthData();
    if (auth?.token) {
      router.push("/chat");
    } else {
      setLoading(false);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    setWakingUp(false);

    const wakingTimer = setTimeout(() => {
      setWakingUp(true);
    }, 4000);

    try {
      if (isLogin) {
        const res = await fetchWithRetry(`${BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: identifier.trim(), password }),
          timeout: 30000,
          retries: 4,
          delay: 2000,
        });
        const data = await res.json();
        clearTimeout(wakingTimer);
        if (res.ok) {
          setAuthData({ token: data.token, user: data.user });
          router.push("/chat");
        } else {
          setError(data.detail || "Connexion échouée");
        }
      } else {
        if (password.length < 6) {
          clearTimeout(wakingTimer);
          setError("Le mot de passe doit contenir au moins 6 caractères");
          setSubmitting(false);
          return;
        }
        const cleanUser = username.trim();
        const res = await fetchWithRetry(`${BASE_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: cleanUser,
            email: email.trim(),
            full_name: fullName.trim(),
            password,
            avatar_url: `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(cleanUser)}`,
          }),
          timeout: 30000,
          retries: 4,
          delay: 2000,
        });
        const data = await res.json();
        clearTimeout(wakingTimer);
        if (res.ok) {
          setAuthData({ token: data.token, user: data.user });
          router.push("/chat");
        } else {
          setError(data.detail || "Inscription échouée");
        }
      }
    } catch {
      clearTimeout(wakingTimer);
      setError("Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.");
    }
    setSubmitting(false);
    setWakingUp(false);
  };

  if (loading) return null;

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", width: "100vw", padding: "20px" }}>
      <div
        className="glass-panel animate-slide-up"
        style={{
          padding: "40px",
          maxWidth: "440px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(212, 175, 55, 0.18)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "24px" }}>
          <img
            src="/logo.png"
            alt="IQChat Logo"
            style={{
              width: "84px",
              height: "84px",
              borderRadius: "22px",
              marginBottom: "14px",
              boxShadow: "0 8px 24px rgba(197, 160, 59, 0.25)",
              border: "2px solid rgba(197, 160, 59, 0.4)",
            }}
          />
          <h1 style={{ color: "var(--accent-gold)", fontWeight: 700, fontSize: "2.3rem", letterSpacing: "1px" }}>IQChat</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", marginTop: "4px" }}>
            Messagerie Intentionnelle &amp; Confidentielle
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "26px", background: "rgba(0,0,0,0.22)", padding: "6px", borderRadius: "14px" }}>
          <button
            type="button"
            className={`btn-alt ${isLogin ? "active" : ""}`}
            style={{
              flex: 1,
              border: "none",
              borderRadius: "10px",
              padding: "10px",
              background: isLogin ? "var(--accent-gold-gradient)" : "transparent",
              color: isLogin ? "#1A1A1A" : "var(--text-secondary)",
              fontWeight: 600,
            }}
            onClick={() => {
              setIsLogin(true);
              setError("");
            }}
          >
            Connexion
          </button>
          <button
            type="button"
            className={`btn-alt ${!isLogin ? "active" : ""}`}
            style={{
              flex: 1,
              border: "none",
              borderRadius: "10px",
              padding: "10px",
              background: !isLogin ? "var(--accent-gold-gradient)" : "transparent",
              color: !isLogin ? "#1A1A1A" : "var(--text-secondary)",
              fontWeight: 600,
            }}
            onClick={() => {
              setIsLogin(false);
              setError("");
            }}
          >
            Créer un compte
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(255, 77, 79, 0.1)",
              border: "1px solid rgba(255, 77, 79, 0.3)",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "18px",
              color: "#ff6b6b",
              fontSize: "13.5px",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Icon name="alert-triangle" size={18} color="#ff6b6b" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {isLogin ? (
            <>
              <input
                type="text"
                className="input-royal"
                placeholder="Email ou nom d'utilisateur"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-royal"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: "44px" }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: "4px",
                  }}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                className="input-royal"
                placeholder="Nom complet"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <input
                type="text"
                className="input-royal"
                placeholder="Nom d'utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <input
                type="email"
                className="input-royal"
                placeholder="Adresse e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-royal"
                  placeholder="Mot de passe (min. 6 caractères)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: "44px" }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: "4px",
                  }}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
                </button>
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn-royal"
            style={{ width: "100%", marginTop: "8px", padding: "14px", borderRadius: "12px", fontSize: "1rem" }}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Icon name="refresh" size={18} className="spin" />
                <span>Connexion en cours...</span>
              </>
            ) : (
              <>
                <span>{isLogin ? "Se connecter" : "Créer mon compte"}</span>
                <Icon name="chevron-right" size={18} />
              </>
            )}
          </button>
        </form>

        {wakingUp && submitting && (
          <div
            style={{
              marginTop: "18px",
              padding: "12px",
              background: "rgba(197, 160, 59, 0.08)",
              border: "1px solid rgba(197, 160, 59, 0.22)",
              borderRadius: "10px",
              color: "var(--accent-gold)",
              fontSize: "13px",
              lineHeight: "1.5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <Icon name="clock" size={16} />
            <span>Réveil du serveur sécurisé en cours, veuillez patienter...</span>
          </div>
        )}
      </div>
    </div>
  );
}
