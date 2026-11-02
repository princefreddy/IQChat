"use client";
import { useState, useEffect } from "react";
import { apiFetch, uploadFile, clearChatMemoryCache, clearAuthData } from "@/lib/api";
import { useToast } from "./ToastProvider";
import Icon, { type IconName } from "./Icon";

type TabKey = "profile" | "slow" | "privacy" | "appearance" | "account";

export default function SettingsModal({ user, onClose, onSave }: any) {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  // Profile fields
  const [fullName, setFullName] = useState(user.full_name || "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || "");
  const [bio, setBio] = useState(user.bio || "");

  // Slow Communication & Wellbeing
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(!!user.quiet_hours_enabled);
  const [quietHoursStart, setQuietHoursStart] = useState<string>(user.quiet_hours_start || "22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState<string>(user.quiet_hours_end || "08:00");
  const [defaultEphemeralTtl, setDefaultEphemeralTtl] = useState<number>(user.default_ephemeral_ttl || 10);
  const [autoResetMode, setAutoResetMode] = useState<boolean>(user.auto_reset_mode !== false);

  // Privacy & Security
  const [showOnlineStatus, setShowOnlineStatus] = useState<boolean>(user.show_online_status !== false);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState<boolean>(user.read_receipts_enabled !== false);
  const [allowDmRequests, setAllowDmRequests] = useState<boolean>(user.allow_dm_requests !== false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Comfort & Display
  const [fontSize, setFontSize] = useState<string>(user.font_size || "normal");
  const [enterToSend, setEnterToSend] = useState<boolean>(user.enter_to_send !== false);
  const [linkPreviewsEnabled, setLinkPreviewsEnabled] = useState<boolean>(user.link_previews_enabled !== false);

  // Account danger zone
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fullName.trim()) {
      showToast("Le nom complet est requis", "error");
      return;
    }

    const updates: any = {
      full_name: fullName.trim(),
      avatar_url: avatarUrl,
      bio: bio.trim(),
      quiet_hours_enabled: quietHoursEnabled,
      quiet_hours_start: quietHoursStart,
      quiet_hours_end: quietHoursEnd,
      default_ephemeral_ttl: defaultEphemeralTtl,
      auto_reset_mode: autoResetMode,
      show_online_status: showOnlineStatus,
      read_receipts_enabled: readReceiptsEnabled,
      allow_dm_requests: allowDmRequests,
      font_size: fontSize,
      enter_to_send: enterToSend,
      link_previews_enabled: linkPreviewsEnabled,
    };

    if (password) {
      if (password.length < 6) {
        showToast("Le nouveau mot de passe doit contenir au moins 6 caractères", "error");
        return;
      }
      if (password !== confirmPassword) {
        showToast("La confirmation du mot de passe ne correspond pas", "error");
        return;
      }
      updates.password = password;
      if (currentPassword) updates.current_password = currentPassword;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/users/me", {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        onSave(data);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || "Impossible d'enregistrer les paramètres", "error");
      }
    } catch {
      showToast("Erreur réseau lors de la sauvegarde", "error");
    }
    setSaving(false);
  };

  const handleGenerateAvatar = () => {
    const seed = `${user.username}_${Math.floor(Math.random() * 10000)}`;
    setAvatarUrl(`https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(seed)}`);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "SUPPRIMER") return;
    try {
      const res = await apiFetch("/users/me", { method: "DELETE" });
      if (res.ok) {
        clearAuthData();
        window.location.href = "/";
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || "Suppression impossible", "error");
      }
    } catch {
      showToast("Erreur réseau", "error");
    }
  };

  const tabs: { key: TabKey; label: string; icon: IconName }[] = [
    { key: "profile", label: "Profil", icon: "user" },
    { key: "slow", label: "Quiétude", icon: "moon" },
    { key: "privacy", label: "Confidentialité", icon: "shield" },
    { key: "appearance", label: "Affichage", icon: "sliders" },
    { key: "account", label: "Compte", icon: "settings" },
  ];

  const SwitchRow = ({
    title,
    desc,
    checked,
    onChange,
  }: {
    title: string;
    desc: string;
    checked: boolean;
    onChange: (val: boolean) => void;
  }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "12px 14px",
        background: "rgba(0,0,0,0.2)",
        borderRadius: "12px",
        border: "1px solid var(--border-glass)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#FFF" }}>{title}</div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px", lineHeight: 1.4 }}>{desc}</div>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`royal-switch ${checked ? "on" : ""}`}
      />
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(5, 9, 22, 0.78)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel animate-slide-up"
        style={{
          width: "100%",
          maxWidth: "660px",
          maxHeight: "88vh",
          background: "#0E1834",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgba(197, 160, 59, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-glass)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="settings" size={20} color="var(--accent-gold)" />
            <h2 style={{ color: "var(--accent-gold)", fontSize: "19px", margin: 0 }}>Paramètres</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Fermer">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            padding: "12px 24px",
            borderBottom: "1px solid var(--border-glass)",
            overflowX: "auto",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          {tabs.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "10px",
                  border: active ? "1px solid var(--accent-gold)" : "1px solid transparent",
                  background: active ? "rgba(197, 160, 59, 0.16)" : "transparent",
                  color: active ? "var(--accent-gold)" : "var(--text-secondary)",
                  fontWeight: active ? 600 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  whiteSpace: "nowrap",
                  transition: "all 0.2s",
                }}
              >
                <Icon name={t.icon} size={15} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {activeTab === "profile" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "18px",
                  background: "rgba(0,0,0,0.22)",
                  padding: "16px",
                  borderRadius: "14px",
                  border: "1px solid var(--border-glass)",
                  flexWrap: "wrap",
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    style={{
                      width: "68px",
                      height: "68px",
                      borderRadius: "34px",
                      objectFit: "cover",
                      border: "2px solid var(--accent-gold)",
                      background: "#101F42",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "68px",
                      height: "68px",
                      borderRadius: "34px",
                      background: "var(--accent-royal)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="user" size={28} />
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "15px" }}>{user.full_name || user.username}</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <input
                      type="file"
                      accept="image/*"
                      id="avatar-upload-web"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingAvatar(true);
                        try {
                          const uploaded = await uploadFile(file);
                          setAvatarUrl(uploaded.url);
                          showToast("Photo de profil chargée", "success");
                        } catch (err: any) {
                          showToast(err.message || "Échec du téléversement", "error");
                        } finally {
                          setUploadingAvatar(false);
                        }
                      }}
                    />
                    <label
                      htmlFor="avatar-upload-web"
                      className="btn-alt"
                      style={{ padding: "7px 12px", fontSize: "12.5px", cursor: uploadingAvatar ? "wait" : "pointer" }}
                    >
                      <Icon name="image" size={15} />
                      <span>{uploadingAvatar ? "Chargement..." : "Importer une photo"}</span>
                    </label>
                    <button
                      type="button"
                      className="btn-alt"
                      style={{ padding: "7px 12px", fontSize: "12.5px" }}
                      onClick={handleGenerateAvatar}
                    >
                      <Icon name="refresh" size={15} />
                      <span>Avatar aléatoire</span>
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.18)",
                    borderRadius: "10px",
                    border: "1px solid var(--border-glass)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Identifiant</div>
                    <div style={{ fontSize: "13.5px", fontWeight: 600 }}>@{user.username}</div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: "30px", height: "30px" }}
                    title="Copier l'identifiant"
                    onClick={() => {
                      navigator.clipboard.writeText(`@${user.username}`);
                      showToast("Identifiant copié", "info");
                    }}
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </div>

                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.18)",
                    borderRadius: "10px",
                    border: "1px solid var(--border-glass)",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>E-mail</div>
                  <div style={{ fontSize: "13.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user.email}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                  Nom d&apos;affichage
                </label>
                <input
                  className="input-royal"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Votre nom complet"
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <label style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                    Biographie / Statut d&apos;intention
                  </label>
                  <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>{bio.length}/160</span>
                </div>
                <textarea
                  className="input-royal"
                  value={bio}
                  maxLength={160}
                  rows={2}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Ex. Disponible le soir, privilégie les messages posés..."
                  style={{ resize: "none" }}
                />
              </div>
            </>
          )}

          {activeTab === "slow" && (
            <>
              <SwitchRow
                title="Heures de quiétude (Mode Repos)"
                desc="Indique calmement à vos interlocuteurs que vous vous reposez et leur propose de vous écrire en différé."
                checked={quietHoursEnabled}
                onChange={setQuietHoursEnabled}
              />

              {quietHoursEnabled && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                    padding: "14px",
                    borderRadius: "12px",
                    background: "rgba(197, 160, 59, 0.07)",
                    border: "1px solid rgba(197, 160, 59, 0.25)",
                  }}
                >
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "var(--accent-gold)", marginBottom: "6px" }}>
                      Début du repos
                    </label>
                    <input
                      type="time"
                      className="input-royal"
                      value={quietHoursStart}
                      onChange={(e) => setQuietHoursStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "var(--accent-gold)", marginBottom: "6px" }}>
                      Fin du repos (réveil)
                    </label>
                    <input
                      type="time"
                      className="input-royal"
                      value={quietHoursEnd}
                      onChange={(e) => setQuietHoursEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <SwitchRow
                title="Réinitialiser le mode d'envoi après chaque message"
                desc="Revient automatiquement au mode Normal après l'envoi d'un message caché, éphémère, différé ou anonyme."
                checked={autoResetMode}
                onChange={setAutoResetMode}
              />

              <div
                style={{
                  padding: "14px",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-glass)",
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>
                  Durée par défaut des messages éphémères
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                  Le compte à rebours ne commence qu&apos;à la lecture effective par le destinataire.
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { label: "5 sec", val: 5 },
                    { label: "10 sec", val: 10 },
                    { label: "1 min", val: 60 },
                    { label: "1 heure", val: 3600 },
                    { label: "24 heures", val: 86400 },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      className={`btn-alt ${defaultEphemeralTtl === opt.val ? "active" : ""}`}
                      style={{ padding: "7px 14px", fontSize: "12.5px" }}
                      onClick={() => setDefaultEphemeralTtl(opt.val)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "privacy" && (
            <>
              <SwitchRow
                title="Afficher mon statut En ligne"
                desc="Permet aux autres membres de voir lorsque vous êtes actuellement actif sur l'application."
                checked={showOnlineStatus}
                onChange={setShowOnlineStatus}
              />

              <SwitchRow
                title="Confirmations de lecture"
                desc="Informe vos correspondants lorsque vous avez lu leurs messages."
                checked={readReceiptsEnabled}
                onChange={setReadReceiptsEnabled}
              />

              <SwitchRow
                title="Autoriser les nouvelles demandes de discussion"
                desc="Si désactivé, les membres avec qui vous n'échangez pas encore ne pourront pas vous envoyer d'invitation."
                checked={allowDmRequests}
                onChange={setAllowDmRequests}
              />

              <div
                style={{
                  marginTop: "6px",
                  padding: "16px",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-glass)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "14px", color: "var(--accent-gold)" }}>
                  <Icon name="lock" size={16} />
                  <span>Modifier mon mot de passe</span>
                </div>
                <input
                  type="password"
                  className="input-royal"
                  placeholder="Mot de passe actuel"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <input
                    type="password"
                    className="input-royal"
                    placeholder="Nouveau mot de passe (min. 6)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <input
                    type="password"
                    className="input-royal"
                    placeholder="Confirmer le mot de passe"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === "appearance" && (
            <>
              <div
                style={{
                  padding: "14px",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-glass)",
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Taille du texte des messages</div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                  Ajustez la densité de lecture dans vos conversations.
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[
                    { key: "compact", label: "Compact" },
                    { key: "normal", label: "Standard" },
                    { key: "large", label: "Confort (Grand)" },
                  ].map((sz) => (
                    <button
                      key={sz.key}
                      type="button"
                      className={`btn-alt ${fontSize === sz.key ? "active" : ""}`}
                      style={{ flex: 1, padding: "9px 12px", fontSize: "13px" }}
                      onClick={() => setFontSize(sz.key)}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              <SwitchRow
                title="Envoyer avec la touche Entrée"
                desc="Appuyez sur Entrée pour envoyer rapidement, et Maj + Entrée pour insérer un retour à la ligne."
                checked={enterToSend}
                onChange={setEnterToSend}
              />

              <SwitchRow
                title="Aperçus enrichis des liens web"
                desc="Affiche automatiquement un aperçu (titre et image) lorsqu'un message contient une adresse web."
                checked={linkPreviewsEnabled}
                onChange={setLinkPreviewsEnabled}
              />
            </>
          )}

          {activeTab === "account" && (
            <>
              <div
                style={{
                  padding: "16px",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-glass)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>Cache local des conversations</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Libère la mémoire temporaire et force une synchronisation complète avec le serveur.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-alt"
                  style={{ padding: "8px 14px", fontSize: "13px", whiteSpace: "nowrap" }}
                  onClick={() => {
                    clearChatMemoryCache();
                    showToast("Cache local vidé avec succès", "success");
                  }}
                >
                  <Icon name="refresh" size={15} />
                  <span>Vider le cache</span>
                </button>
              </div>

              <div
                style={{
                  padding: "16px",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-glass)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>Session active</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Fermer votre session sur ce navigateur.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-alt"
                  style={{ padding: "8px 14px", fontSize: "13px", whiteSpace: "nowrap" }}
                  onClick={() => {
                    clearAuthData();
                    window.location.href = "/";
                  }}
                >
                  <Icon name="log-out" size={15} />
                  <span>Se déconnecter</span>
                </button>
              </div>

              {user.username !== "admin" && (
                <div
                  style={{
                    padding: "16px",
                    background: "rgba(239, 68, 68, 0.08)",
                    borderRadius: "12px",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#f87171", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Icon name="alert-triangle" size={16} color="#f87171" />
                    <span>Zone sensible — Suppression du compte</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Cette action supprime définitivement votre profil et vos publications publiques.
                  </div>
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      style={{
                        alignSelf: "flex-start",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        border: "1px solid #ef4444",
                        background: "transparent",
                        color: "#ef4444",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Supprimer mon compte...
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        className="input-royal"
                        placeholder="Tapez SUPPRIMER pour confirmer"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        style={{ flex: 1, minWidth: "200px", padding: "8px 12px", fontSize: "13px" }}
                      />
                      <button
                        type="button"
                        disabled={deleteConfirmText !== "SUPPRIMER"}
                        onClick={handleDeleteAccount}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#ef4444",
                          color: "#FFF",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor: deleteConfirmText === "SUPPRIMER" ? "pointer" : "not-allowed",
                          opacity: deleteConfirmText === "SUPPRIMER" ? 1 : 0.4,
                        }}
                      >
                        Confirmer la suppression
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Save Bar */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-glass)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            background: "rgba(0,0,0,0.18)",
          }}
        >
          <button type="button" className="btn-alt" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-royal" onClick={handleSave} disabled={saving}>
            <Icon name="check" size={16} />
            <span>{saving ? "Enregistrement..." : "Enregistrer les préférences"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
