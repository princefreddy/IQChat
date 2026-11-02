"use client";
import { useState, useEffect, useCallback } from "react";
import SettingsModal from "./SettingsModal";
import { ChatSkeleton } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";
import { apiFetch, clearAuthData, setAuthData, getAuthData } from "@/lib/api";
import Icon from "./Icon";

export default function ChatList({ user, activeChatId, onSelectChat, onUserUpdate, refreshSignal }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"chats" | "directory">("chats");
  const [loading, setLoading] = useState(true);

  const [dirSearch, setDirSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");

  // 1-step Group creation modal state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  const { showToast } = useToast();

  const fetchChats = useCallback(async () => {
    try {
      const res = await apiFetch("/chats/");
      if (res.ok) setChats(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  const fetchDirectory = useCallback(async () => {
    try {
      const res = await apiFetch("/users/");
      if (res.ok) setDirectory(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchChats();
    fetchDirectory();
    const interval = setInterval(() => {
      fetchChats();
      fetchDirectory();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchChats, fetchDirectory]);

  useEffect(() => {
    if (refreshSignal) {
      fetchChats();
      fetchDirectory();
    }
  }, [refreshSignal, fetchChats, fetchDirectory]);

  const handleCreatePrivateChat = async (targetUsername: string, targetFullName?: string) => {
    if (!targetUsername) return;
    try {
      const res = await apiFetch("/chats/create", {
        method: "POST",
        body: JSON.stringify({
          type: "private",
          name: targetFullName || targetUsername,
          member_usernames: [targetUsername],
        }),
      });
      if (res.ok) {
        const createdChat = await res.json();
        setViewMode("chats");
        fetchChats();
        if (createdChat?.id) onSelectChat(createdChat.id);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || "Impossible d'ouvrir cette discussion.", "warning");
      }
    } catch {
      showToast("Erreur réseau", "error");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await apiFetch("/chats/create", {
        method: "POST",
        body: JSON.stringify({
          type: "group",
          name: groupName.trim(),
          member_usernames: selectedGroupUsers,
        }),
      });
      if (res.ok) {
        const createdChat = await res.json();
        setGroupName("");
        setSelectedGroupUsers([]);
        setGroupMemberSearch("");
        setShowGroupModal(false);
        setViewMode("chats");
        fetchChats();
        if (createdChat?.id) onSelectChat(createdChat.id);
        showToast(`Groupe "${createdChat.name}" créé`, "success");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || "Impossible de créer le groupe.", "error");
      }
    } catch {
      showToast("Erreur réseau", "error");
    }
    setCreatingGroup(false);
  };

  const handleToggleBan = async (userId: string, currentBanState: boolean) => {
    if (!window.confirm(currentBanState ? "Réactiver cet utilisateur ?" : "Suspendre cet utilisateur ?")) return;
    try {
      const res = await apiFetch(`/users/${userId}/ban`, { method: "PUT" });
      if (res.ok) {
        fetchDirectory();
        showToast(currentBanState ? "Utilisateur réactivé" : "Utilisateur suspendu", currentBanState ? "success" : "warning");
      }
    } catch {}
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const d = new Date(dateString.endsWith("Z") || dateString.includes("+") ? dateString : `${dateString}Z`);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const filteredChats = chats.filter((chat) => {
    if (!chatSearch.trim()) return true;
    const q = chatSearch.toLowerCase();
    const otherMember = chat.type === "private" ? chat.members?.find((m: any) => m.user_id !== currentUser.id) : null;
    const title = chat.type === "private" ? otherMember?.full_name || otherMember?.username || "" : chat.name || "";
    return title.toLowerCase().includes(q) || (chat.last_message_preview || "").toLowerCase().includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "14px 16px" }}>
      {showSettings && (
        <SettingsModal
          user={currentUser}
          onClose={() => setShowSettings(false)}
          onSave={(u: any) => {
            setCurrentUser(u);
            onUserUpdate?.(u);
            const auth = getAuthData();
            if (auth?.token) setAuthData({ token: auth.token, user: u });
            setShowSettings(false);
            showToast("Paramètres enregistrés", "success");
          }}
        />
      )}

      {/* Mode Switcher */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          type="button"
          className={`btn-alt ${viewMode === "chats" ? "active" : ""}`}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px" }}
          onClick={() => setViewMode("chats")}
        >
          <Icon name="message-square" size={15} />
          <span>Messages</span>
        </button>
        <button
          type="button"
          className={`btn-alt ${viewMode === "directory" ? "active" : ""}`}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px" }}
          onClick={() => setViewMode("directory")}
        >
          <Icon name="users" size={15} />
          <span>Annuaire</span>
        </button>
      </div>

      {viewMode === "chats" && (
        <>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                className="input-royal"
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Filtrer les discussions..."
                style={{ padding: "8px 12px 8px 34px", fontSize: "13px" }}
              />
              <span style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
                <Icon name="search" size={14} color="var(--text-secondary)" />
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowGroupModal(true)}
              className="btn-royal"
              style={{ padding: "8px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}
              title="Créer un nouveau groupe"
            >
              <Icon name="plus" size={15} color="#0A1128" />
              <span>Groupe</span>
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
            {loading ? (
              <ChatSkeleton />
            ) : filteredChats.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--text-secondary)",
                  marginTop: "44px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <Icon name="inbox" size={32} color="var(--text-secondary)" />
                <div style={{ fontSize: "13px" }}>
                  {chatSearch ? "Aucune discussion trouvée." : "Aucune conversation active."}
                </div>
                {!chatSearch && (
                  <button type="button" className="btn-alt" style={{ fontSize: "12px", padding: "6px 14px" }} onClick={() => setViewMode("directory")}>
                    Parcourir l&apos;Annuaire
                  </button>
                )}
              </div>
            ) : (
              filteredChats.map((chat) => {
                const isSelected = activeChatId === chat.id;
                const otherMember = chat.type === "private" ? chat.members?.find((m: any) => m.user_id !== currentUser.id) : null;
                const otherUser = otherMember ? directory.find((u) => u.id === otherMember.user_id) || otherMember : null;
                const previewText =
                  chat.last_message_preview || (chat.type === "group" ? `${chat.members?.length || 1} membre(s)` : "Nouvelle discussion");

                return (
                  <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    style={{
                      padding: "11px 14px",
                      cursor: "pointer",
                      borderRadius: "12px",
                      background: isSelected ? "rgba(197, 160, 59, 0.13)" : "var(--bg-glass)",
                      border: `1px solid ${isSelected ? "var(--accent-gold)" : "transparent"}`,
                      transition: "all 0.18s",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "11px", minWidth: 0, flex: 1 }}>
                      {chat.type === "private" && otherUser?.avatar_url ? (
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <img src={otherUser.avatar_url} alt="" style={{ width: "38px", height: "38px", borderRadius: "19px", objectFit: "cover" }} />
                          {otherUser.is_online && (
                            <span
                              style={{
                                position: "absolute",
                                bottom: 0,
                                right: 0,
                                width: "10px",
                                height: "10px",
                                backgroundColor: "#4ade80",
                                borderRadius: "5px",
                                border: "2px solid var(--bg-primary)",
                              }}
                            />
                          )}
                        </div>
                      ) : (
                        <div
                          style={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "19px",
                            background: "var(--accent-gold-gradient)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#0A1128",
                            fontWeight: 700,
                            fontSize: "14px",
                            flexShrink: 0,
                          }}
                        >
                          {chat.type === "private" && otherUser
                            ? (otherUser.full_name || otherUser.username).charAt(0).toUpperCase()
                            : (chat.name || "G").charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span
                            style={{
                              fontWeight: chat.unread_count > 0 ? 700 : 500,
                              color: isSelected ? "var(--accent-gold)" : "white",
                              fontSize: "14px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {chat.type === "private" && otherUser ? otherUser.full_name || otherUser.username : chat.name || "Groupe"}
                          </span>
                          {chat.type === "private" && otherUser?.is_in_quiet_hours && (
                            <Icon name="moon" size={12} color="var(--accent-gold)" />
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: chat.unread_count > 0 ? "var(--text-primary)" : "var(--text-secondary)",
                            fontWeight: chat.unread_count > 0 ? 500 : 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginTop: "2px",
                          }}
                        >
                          {previewText}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
                      {chat.status === "pending" ? (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--accent-gold)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            fontWeight: 500,
                          }}
                        >
                          <Icon name="clock" size={12} color="var(--accent-gold)" />
                          <span>
                            {chat.members?.find((m: any) => m.user_id === currentUser.id)?.role === "admin"
                              ? "En attente"
                              : "Invitation"}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                            {formatDate(chat.last_message_at || chat.created_at)}
                          </div>
                          {chat.unread_count > 0 && (
                            <div
                              style={{
                                backgroundColor: "var(--accent-gold)",
                                color: "#0A1128",
                                fontSize: "11px",
                                fontWeight: 700,
                                minWidth: "20px",
                                height: "20px",
                                borderRadius: "10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "0 6px",
                              }}
                            >
                              {chat.unread_count}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Directory Tab */}
      {viewMode === "directory" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ position: "relative", marginBottom: "4px" }}>
            <input
              className="input-royal"
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="Rechercher un membre..."
              style={{ padding: "9px 34px 9px 34px", fontSize: "13px" }}
            />
            <span style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
              <Icon name="search" size={14} color="var(--text-secondary)" />
            </span>
            {dirSearch && (
              <button
                type="button"
                onClick={() => setDirSearch("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          {directory
            .filter((u) => {
              if (u.id === currentUser.id) return false;
              if (u.is_banned && currentUser.username !== "admin") return false;
              if (!dirSearch) return true;
              const q = dirSearch.toLowerCase();
              return u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
            })
            .map((u) => (
              <div
                key={u.id}
                onClick={() => !u.is_banned && handleCreatePrivateChat(u.username, u.full_name)}
                style={{
                  padding: "11px 14px",
                  cursor: u.is_banned ? "default" : "pointer",
                  borderRadius: "12px",
                  background: "var(--bg-glass)",
                  border: "1px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  opacity: u.is_banned ? 0.5 : 1,
                }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img src={u.avatar_url} alt="" style={{ width: "40px", height: "40px", borderRadius: "20px", objectFit: "cover" }} />
                  {u.is_online && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        width: "11px",
                        height: "11px",
                        backgroundColor: "#4ade80",
                        borderRadius: "6px",
                        border: "2px solid var(--bg-primary)",
                      }}
                    />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "white", fontWeight: 500, fontSize: "14px", textDecoration: u.is_banned ? "line-through" : "none" }}>
                      {u.full_name}
                    </span>
                    {u.is_in_quiet_hours && <Icon name="moon" size={12} color="var(--accent-gold)" />}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    @{u.username}
                    {u.bio ? ` • ${u.bio}` : ""}
                    {u.is_banned && <span style={{ color: "#f87171", fontWeight: 600 }}> [Suspendu]</span>}
                  </div>
                </div>

                {currentUser.username === "admin" && u.username !== "admin" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleBan(u.id, u.is_banned);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: u.is_banned ? "rgba(74,222,128,0.12)" : "rgba(239,68,68,0.12)",
                      color: u.is_banned ? "#4ade80" : "#f87171",
                      border: `1px solid ${u.is_banned ? "#4ade80" : "#f87171"}`,
                      fontWeight: 600,
                      fontSize: "11px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Icon name={u.is_banned ? "refresh" : "ban"} size={12} />
                    <span>{u.is_banned ? "Réactiver" : "Suspendre"}</span>
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {/* 1-Step Group Creation Modal */}
      {showGroupModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,9,22,0.8)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => setShowGroupModal(false)}
        >
          <form
            onSubmit={handleCreateGroup}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0E1834",
              padding: "22px",
              borderRadius: "16px",
              border: "1px solid rgba(197,160,59,0.3)",
              width: "100%",
              maxWidth: "410px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent-gold)", fontWeight: 600 }}>
                <Icon name="users" size={18} color="var(--accent-gold)" />
                <span>Nouveau Groupe</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowGroupModal(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>Nom du groupe</label>
              <input
                className="input-royal"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex : Cercle de lecture, Projet..."
                autoFocus
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                Participants ({selectedGroupUsers.length} sélectionné{selectedGroupUsers.length > 1 ? "s" : ""})
              </label>
              <input
                className="input-royal"
                value={groupMemberSearch}
                onChange={(e) => setGroupMemberSearch(e.target.value)}
                placeholder="Filtrer l'annuaire..."
                style={{ padding: "8px 10px", fontSize: "13px", marginBottom: "8px" }}
              />
              <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                {directory
                  .filter((u) => {
                    if (u.id === currentUser.id || u.is_banned) return false;
                    if (!groupMemberSearch.trim()) return true;
                    const q = groupMemberSearch.toLowerCase();
                    return u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
                  })
                  .map((u) => {
                    const selected = selectedGroupUsers.includes(u.username);
                    return (
                      <div
                        key={u.id}
                        onClick={() =>
                          setSelectedGroupUsers((prev) =>
                            selected ? prev.filter((x) => x !== u.username) : [...prev, u.username]
                          )
                        }
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          background: selected ? "rgba(197,160,59,0.18)" : "var(--bg-glass)",
                          border: `1px solid ${selected ? "var(--accent-gold)" : "transparent"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <img src={u.avatar_url} alt="" style={{ width: "26px", height: "26px", borderRadius: "13px", objectFit: "cover" }} />
                          <div>
                            <div style={{ color: "white", fontSize: "13px" }}>{u.full_name}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>@{u.username}</div>
                          </div>
                        </div>
                        {selected && <Icon name="check" size={15} color="var(--accent-gold)" />}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button type="button" className="btn-alt" style={{ flex: 1 }} onClick={() => setShowGroupModal(false)}>
                Annuler
              </button>
              <button type="submit" className="btn-royal" style={{ flex: 1 }} disabled={!groupName.trim() || creatingGroup}>
                {creatingGroup ? "Création..." : "Créer le groupe"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User Footer */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: "14px",
          borderTop: "1px solid var(--border-glass)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", minWidth: 0, flex: 1 }}
          onClick={() => setShowSettings(true)}
        >
          <img
            src={currentUser.avatar_url}
            alt="avatar"
            style={{ width: "38px", height: "38px", borderRadius: "19px", background: "white", objectFit: "cover", flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentUser.full_name}
            </div>
            <div style={{ fontSize: "12px", color: "var(--accent-gold)", display: "flex", alignItems: "center", gap: "4px" }}>
              <Icon name="settings" size={12} color="var(--accent-gold)" />
              <span>Paramètres</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn danger"
          onClick={() => {
            clearAuthData();
            window.location.href = "/";
          }}
          title="Se déconnecter"
        >
          <Icon name="log-out" size={17} />
        </button>
      </div>
    </div>
  );
}
