import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PublicationsFeed from "../../components/PublicationsFeed";
import SettingsModal from "../../components/SettingsModal";
import {
  getAuthData,
  setAuthData,
  clearAuthData,
  apiFetch,
  getUserWsUrl,
} from "../../lib/api";
import { ChatSkeleton } from "../../components/SkeletonLoader";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ViewMode = "chats" | "directory" | "feed" | "announce";

export default function ChatListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>("");
  const [chats, setChats] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("chats");

  const [chatSearch, setChatSearch] = useState("");
  const [dirSearch, setDirSearch] = useState("");

  // 1-step Group creation modal state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Admin announcement state
  const [announcementText, setAnnouncementText] = useState("");
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasNewFeed, setHasNewFeed] = useState(false);
  const [loading, setLoading] = useState(true);

  const chatsRef = useRef(chats);
  const directoryRef = useRef(directory);
  const viewModeRef = useRef(viewMode);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  useEffect(() => {
    directoryRef.current = directory;
  }, [directory]);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const changeViewMode = (mode: ViewMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode(mode);
  };

  const fetchChats = useCallback(async () => {
    try {
      const res = await apiFetch("/chats/");
      if (res.ok) setChats(await res.json());
    } catch {
      // silent
    }
  }, []);

  const fetchDirectory = useCallback(async () => {
    try {
      const res = await apiFetch("/users/");
      if (res.ok) setDirectory(await res.json());
    } catch {
      // silent
    }
  }, []);

  const syncMe = useCallback(async (tok: string) => {
    try {
      const res = await apiFetch("/users/me");
      if (res.ok) {
        const freshUser = await res.json();
        setUser(freshUser);
        await setAuthData({ token: tok, user: freshUser });
      }
    } catch {
      // silent
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const isFirstLoad = chatsRef.current.length === 0 && directoryRef.current.length === 0;
      if (isFirstLoad) setLoading(true);

      getAuthData().then((auth) => {
        if (!auth?.token) {
          router.replace("/");
        } else {
          setUser(auth.user);
          setToken(auth.token);
          syncMe(auth.token);
          Promise.all([fetchChats(), fetchDirectory()]).finally(() => {
            setLoading(false);
          });
        }
      });

      const checkFeed = async () => {
        try {
          const res = await apiFetch("/publications/latest_time");
          if (!res.ok) return;
          const data = await res.json();
          if (data.latest_time) {
            const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
            const serverDateStr =
              data.latest_time.endsWith("Z") || data.latest_time.includes("+")
                ? data.latest_time
                : `${data.latest_time}Z`;
            const lastSeen = await AsyncStorage.getItem("iqchat_last_seen_feed");
            if (!lastSeen || new Date(serverDateStr).getTime() > new Date(lastSeen).getTime()) {
              if (viewModeRef.current !== "feed") setHasNewFeed(true);
            }
          }
        } catch {
          // silent
        }
      };

      checkFeed();
      const interval = setInterval(() => {
        checkFeed();
        fetchChats();
      }, 30000);

      return () => clearInterval(interval);
    }, [fetchChats, fetchDirectory, router, syncMe])
  );

  // Global /ws/user WebSocket for app-wide presence & instant sidebar updates
  useEffect(() => {
    if (!user?.id || !token) return;
    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!isMounted) return;
      ws = new WebSocket(getUserWsUrl(user.id, token));

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "chats_updated") {
            fetchChats();
          } else if (data.event === "presence" && data.user_id) {
            setDirectory((prev) =>
              prev.map((u) => (u.id === data.user_id ? { ...u, is_online: data.is_online } : u))
            );
            setChats((prev) =>
              prev.map((c) => ({
                ...c,
                members: c.members?.map((m: any) =>
                  m.user_id === data.user_id ? { ...m, is_online: data.is_online } : m
                ),
              }))
            );
          }
        } catch {
          // ignore non-json frames
        }
      };

      ws.onclose = () => {
        if (isMounted) {
          reconnectTimer = setTimeout(connect, 3500);
        }
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [user?.id, token, fetchChats]);

  const onRefresh = useCallback(() => {
    if (!user) return;
    setRefreshing(true);
    Promise.all([fetchChats(), fetchDirectory()]).finally(() => setRefreshing(false));
  }, [user, fetchChats, fetchDirectory]);

  const handleOpenPrivateChat = async (targetUsername: string, targetFullName?: string) => {
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
        if (createdChat?.id) {
          setViewMode("chats");
          fetchChats();
          router.push(`/chat/${createdChat.id}` as any);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Discussion indisponible", err.detail || "Impossible d'initier la discussion.");
      }
    } catch {
      Alert.alert("Erreur", "Erreur réseau lors de la création de la discussion.");
    }
  };

  const handleCreateGroup = async () => {
    const cleanName = groupName.trim();
    if (!cleanName) {
      Alert.alert("Nom requis", "Veuillez saisir un nom pour votre groupe.");
      return;
    }
    setCreatingGroup(true);
    try {
      const res = await apiFetch("/chats/create", {
        method: "POST",
        body: JSON.stringify({
          type: "group",
          name: cleanName,
          member_usernames: selectedGroupMembers,
        }),
      });
      if (res.ok) {
        const createdChat = await res.json();
        setShowGroupModal(false);
        setGroupName("");
        setGroupMemberSearch("");
        setSelectedGroupMembers([]);
        await fetchChats();
        if (createdChat?.id) {
          router.push(`/chat/${createdChat.id}` as any);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Erreur", err.detail || "Impossible de créer le groupe.");
      }
    } catch {
      Alert.alert("Erreur", "Erreur réseau lors de la création du groupe.");
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleSendAnnouncement = async () => {
    if (!announcementText.trim()) return;
    setSendingAnnouncement(true);
    try {
      const res = await apiFetch("/chats/announcement", {
        method: "POST",
        body: JSON.stringify({ content: announcementText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncementText("");
        fetchChats();
        Alert.alert(
          "Annonce diffusée",
          `Votre message officiel a été transmis à ${data.recipients || 0} utilisateur(s).`
        );
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Erreur", err.detail || "Impossible d'envoyer l'annonce.");
      }
    } catch {
      Alert.alert("Erreur", "Erreur réseau lors de l'envoi de l'annonce.");
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const handleToggleBan = (userId: string, currentBanState: boolean) => {
    Alert.alert(
      "Modération",
      currentBanState ? "Débannir cet utilisateur ?" : "Bannir cet utilisateur ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          style: currentBanState ? "default" : "destructive",
          onPress: async () => {
            try {
              const res = await apiFetch(`/users/${userId}/ban`, { method: "PUT" });
              if (res.ok) fetchDirectory();
            } catch {
              // silent
            }
          },
        },
      ]
    );
  };

  const performLogout = async () => {
    await clearAuthData();
    router.replace("/");
  };

  const confirmLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter d'IQChat ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: performLogout },
    ]);
  };

  const formatChatTime = (dateString?: string) => {
    if (!dateString) return "";
    const d = new Date(
      dateString.endsWith("Z") || dateString.includes("+") ? dateString : `${dateString}Z`
    );
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const totalUnread = chats.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  const filteredChats = chats.filter((c) => {
    if (!chatSearch.trim()) return true;
    const q = chatSearch.toLowerCase();
    if (c.type === "group") {
      return (
        c.name?.toLowerCase().includes(q) ||
        c.last_message_preview?.toLowerCase().includes(q)
      );
    }
    const other = c.members?.find((m: any) => m.user_id !== user?.id);
    const dirUser = other ? directory.find((u: any) => u.id === other.user_id) : null;
    const displayName =
      other?.full_name || dirUser?.full_name || other?.username || dirUser?.username || "";
    return (
      displayName.toLowerCase().includes(q) ||
      other?.username?.toLowerCase().includes(q) ||
      c.last_message_preview?.toLowerCase().includes(q)
    );
  });

  const renderChatItem = ({ item }: { item: any }) => {
    const isPrivate = item.type === "private";
    const otherMember = isPrivate
      ? item.members?.find((m: any) => m.user_id !== user?.id)
      : null;
    const otherUserFromDir = otherMember
      ? directory.find((u: any) => u.id === otherMember.user_id)
      : null;

    const displayName = isPrivate
      ? otherMember?.full_name ||
        otherUserFromDir?.full_name ||
        otherMember?.username ||
        otherUserFromDir?.username ||
        "Discussion privée"
      : item.name || "Groupe";

    const avatarUrl = isPrivate
      ? otherMember?.avatar_url || otherUserFromDir?.avatar_url
      : null;
    const isOnline = isPrivate
      ? !!(otherMember?.is_online ?? otherUserFromDir?.is_online)
      : false;
    const isInQuietHours = isPrivate
      ? !!(otherMember?.is_in_quiet_hours ?? otherUserFromDir?.is_in_quiet_hours)
      : false;

    const myRole = item.members?.find((m: any) => m.user_id === user?.id)?.role;
    const previewText =
      item.status === "pending"
        ? myRole === "admin"
          ? "Invitation en attente d'acceptation"
          : "Nouvelle demande de discussion"
        : item.last_message_preview ||
          (isPrivate ? "Démarrer la conversation" : `${item.members?.length || 1} participant(s)`);

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => router.push(`/chat/${item.id}` as any)}
        activeOpacity={0.75}
      >
        <View style={styles.chatAvatar}>
          {isPrivate && avatarUrl ? (
            <View style={{ position: "relative" }}>
              <Image source={{ uri: avatarUrl }} style={{ width: 46, height: 46, borderRadius: 23 }} />
              {isOnline && <View style={styles.onlineDotChatItem} />}
            </View>
          ) : (
            <View style={styles.groupIconCircle}>
              <Feather name={isPrivate ? "user" : "users"} size={20} color="#C5A03B" />
            </View>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.chatName} numberOfLines={1}>
              {displayName}
            </Text>
            {isInQuietHours && <Feather name="moon" size={13} color="#C5A03B" />}
          </View>
          <Text
            style={[
              styles.chatPreview,
              item.unread_count > 0 && { color: "#E2E8F0", fontWeight: "600" },
              item.status === "pending" && { color: "#C5A03B" },
            ]}
            numberOfLines={1}
          >
            {previewText}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end", gap: 6 }}>
          {item.status === "pending" ? (
            <View style={styles.pendingPill}>
              <Feather name="clock" size={11} color="#C5A03B" />
              <Text style={{ fontSize: 10, color: "#C5A03B", fontWeight: "700" }}>
                {myRole === "admin" ? "En attente" : "Invitation"}
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 11, color: "#8E9BAE" }}>
                {formatChatTime(item.last_message_at || item.created_at)}
              </Text>
              {item.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={{ color: "#0A1128", fontSize: 11, fontWeight: "800" }}>
                    {item.unread_count > 99 ? "99+" : item.unread_count}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderDirItem = ({ item }: { item: any }) => {
    if (item.id === user?.id) return null;
    if (item.is_banned && user?.username !== "admin") return null;

    return (
      <TouchableOpacity
        style={[styles.chatItem, { opacity: item.is_banned ? 0.5 : 1 }]}
        onPress={() => handleOpenPrivateChat(item.username, item.full_name)}
        disabled={item.is_banned && user?.username !== "admin"}
        activeOpacity={0.75}
      >
        <View style={{ position: "relative" }}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={{ width: 46, height: 46, borderRadius: 23 }} />
          ) : (
            <View style={styles.groupIconCircle}>
              <Feather name="user" size={20} color="#C5A03B" />
            </View>
          )}
          {item.is_online && <View style={styles.onlineDot} />}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={[
                styles.chatName,
                item.is_banned && { textDecorationLine: "line-through" },
              ]}
              numberOfLines={1}
            >
              {item.full_name || item.username}
            </Text>
            {item.is_in_quiet_hours && <Feather name="moon" size={13} color="#C5A03B" />}
          </View>
          <Text style={styles.chatPreview} numberOfLines={1}>
            @{item.username}
            {item.bio ? ` • ${item.bio}` : ""}
            {item.is_banned ? " [Banni]" : ""}
          </Text>
        </View>

        {user?.username === "admin" && item.username !== "admin" ? (
          <TouchableOpacity
            style={[
              styles.banBtn,
              {
                borderColor: item.is_banned ? "#4ade80" : "#ff4d4f",
                backgroundColor: item.is_banned
                  ? "rgba(74,222,128,0.1)"
                  : "rgba(255,77,79,0.1)",
              },
            ]}
            onPress={() => handleToggleBan(item.id, item.is_banned)}
          >
            <Feather
              name={item.is_banned ? "refresh-cw" : "slash"}
              size={12}
              color={item.is_banned ? "#4ade80" : "#ff4d4f"}
            />
            <Text
              style={{
                color: item.is_banned ? "#4ade80" : "#ff4d4f",
                fontWeight: "700",
                fontSize: 11,
              }}
            >
              {item.is_banned ? "Débannir" : "Bannir"}
            </Text>
          </TouchableOpacity>
        ) : (
          <Feather name="message-circle" size={18} color="#C5A03B" />
        )}
      </TouchableOpacity>
    );
  };

  if (!user) return null;

  const selectableGroupUsers = directory.filter((u) => {
    if (u.id === user.id || u.is_banned) return false;
    if (!groupMemberSearch.trim()) return true;
    const q = groupMemberSearch.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q)
    );
  });

  const footerHeight = 72 + Math.max(insets.bottom, 10);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Complete 5-Tab Settings Modal */}
      <SettingsModal
        visible={showSettings}
        user={user}
        onClose={() => setShowSettings(false)}
        onSave={async (updatedUser) => {
          setUser(updatedUser);
          await setAuthData({ token, user: updatedUser });
          setShowSettings(false);
        }}
        onLogout={performLogout}
      />

      {/* 1-Step Group Creation Modal */}
      <Modal
        visible={showGroupModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGroupModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={[styles.groupModalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.groupModalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="users" size={19} color="#C5A03B" />
                <Text style={styles.groupModalTitle}>Nouveau groupe</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowGroupModal(false);
                  setGroupName("");
                  setGroupMemberSearch("");
                  setSelectedGroupMembers([]);
                }}
              >
                <Feather name="x" size={20} color="#8E9BAE" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Nom du groupe</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Équipe Projet, Lecture..."
              placeholderTextColor="#64748B"
              value={groupName}
              onChangeText={setGroupName}
            />

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 6 }}>
              <Text style={styles.inputLabel}>
                Participants ({selectedGroupMembers.length} sélectionné{selectedGroupMembers.length > 1 ? "s" : ""})
              </Text>
            </View>

            <View style={styles.searchBar}>
              <Feather name="search" size={15} color="#8E9BAE" />
              <TextInput
                placeholder="Filtrer l'annuaire..."
                placeholderTextColor="#8E9BAE"
                value={groupMemberSearch}
                onChangeText={setGroupMemberSearch}
                autoCapitalize="none"
                style={styles.searchInput}
              />
              {groupMemberSearch.length > 0 && (
                <TouchableOpacity onPress={() => setGroupMemberSearch("")}>
                  <Feather name="x" size={15} color="#8E9BAE" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ maxHeight: 240, marginTop: 10, marginBottom: 16 }}>
              {selectableGroupUsers.map((u) => {
                const isSelected = selectedGroupMembers.includes(u.username);
                return (
                  <TouchableOpacity
                    key={u.id}
                    onPress={() =>
                      setSelectedGroupMembers((prev) =>
                        isSelected
                          ? prev.filter((item) => item !== u.username)
                          : [...prev, u.username]
                      )
                    }
                    style={[
                      styles.memberSelectRow,
                      isSelected && {
                        borderColor: "#C5A03B",
                        backgroundColor: "rgba(197,160,59,0.14)",
                      },
                    ]}
                  >
                    {u.avatar_url ? (
                      <Image source={{ uri: u.avatar_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                    ) : (
                      <View style={[styles.groupIconCircle, { width: 34, height: 34, borderRadius: 17 }]}>
                        <Feather name="user" size={15} color="#C5A03B" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 14 }}>
                        {u.full_name || u.username}
                      </Text>
                      <Text style={{ color: "#8E9BAE", fontSize: 12 }}>@{u.username}</Text>
                    </View>
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && { backgroundColor: "#C5A03B", borderColor: "#C5A03B" },
                      ]}
                    >
                      {isSelected && <Feather name="check" size={13} color="#0A1128" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {selectableGroupUsers.length === 0 && (
                <Text style={{ color: "#8E9BAE", textAlign: "center", paddingVertical: 18 }}>
                  Aucun utilisateur trouvé.
                </Text>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.primaryActionBtn,
                (!groupName.trim() || creatingGroup) && { opacity: 0.5 },
              ]}
              onPress={handleCreateGroup}
              disabled={!groupName.trim() || creatingGroup}
            >
              {creatingGroup ? (
                <ActivityIndicator size="small" color="#0A1128" />
              ) : (
                <>
                  <Feather name="check" size={16} color="#0A1128" />
                  <Text style={styles.primaryActionBtnText}>Créer le groupe</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Top Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === "chats" && styles.activeToggle]}
          onPress={() => changeViewMode("chats")}
        >
          <Feather
            name="message-square"
            size={15}
            color={viewMode === "chats" ? "#0A1128" : "#CBD5E1"}
          />
          <Text style={[styles.toggleText, viewMode === "chats" && styles.activeToggleText]}>
            Messages
          </Text>
          {totalUnread > 0 && (
            <View
              style={[
                styles.tabCountBadge,
                viewMode === "chats" && { backgroundColor: "#0A1128" },
              ]}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: viewMode === "chats" ? "#C5A03B" : "#0A1128",
                }}
              >
                {totalUnread > 99 ? "99+" : totalUnread}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === "directory" && styles.activeToggle]}
          onPress={() => changeViewMode("directory")}
        >
          <Feather
            name="users"
            size={15}
            color={viewMode === "directory" ? "#0A1128" : "#CBD5E1"}
          />
          <Text style={[styles.toggleText, viewMode === "directory" && styles.activeToggleText]}>
            Annuaire
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === "feed" && styles.activeToggle]}
          onPress={async () => {
            changeViewMode("feed");
            setHasNewFeed(false);
            const { default: AsyncStorage } = await import(
              "@react-native-async-storage/async-storage"
            );
            AsyncStorage.setItem("iqchat_last_seen_feed", new Date().toISOString());
          }}
        >
          <Feather
            name="globe"
            size={15}
            color={viewMode === "feed" ? "#0A1128" : "#CBD5E1"}
          />
          <Text style={[styles.toggleText, viewMode === "feed" && styles.activeToggleText]}>
            Fil
          </Text>
          {hasNewFeed && <View style={styles.newFeedDot} />}
        </TouchableOpacity>

        {user.username === "admin" && (
          <TouchableOpacity
            style={[styles.toggleBtn, { flex: 0.85 }, viewMode === "announce" && styles.activeToggle]}
            onPress={() => changeViewMode("announce")}
          >
            <Feather
              name="volume-2"
              size={15}
              color={viewMode === "announce" ? "#0A1128" : "#CBD5E1"}
            />
            <Text style={[styles.toggleText, viewMode === "announce" && styles.activeToggleText]}>
              Annonce
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && chats.length === 0 && directory.length === 0 ? (
        <ChatSkeleton />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Discussions Tab */}
          <View style={{ display: viewMode === "chats" ? "flex" : "none", flex: 1 }}>
            <View style={styles.subHeader}>
              <View style={[styles.searchBar, { flex: 1 }]}>
                <Feather name="search" size={15} color="#8E9BAE" />
                <TextInput
                  placeholder="Filtrer vos discussions..."
                  placeholderTextColor="#8E9BAE"
                  value={chatSearch}
                  onChangeText={setChatSearch}
                  style={styles.searchInput}
                />
                {chatSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setChatSearch("")}>
                    <Feather name="x" size={15} color="#8E9BAE" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={styles.newGroupBtn}
                onPress={() => setShowGroupModal(true)}
              >
                <Feather name="plus" size={16} color="#0A1128" />
                <Text style={styles.newGroupBtnText}>Groupe</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={filteredChats}
              keyExtractor={(item) => item.id}
              renderItem={renderChatItem}
              contentContainerStyle={{ paddingBottom: footerHeight + 24 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C5A03B" />
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="message-square" size={34} color="#8E9BAE" />
                  <Text style={styles.emptyText}>
                    {chatSearch
                      ? "Aucune discussion ne correspond à votre filtre."
                      : "Aucune discussion active. Explorez l'Annuaire pour démarrer un échange."}
                  </Text>
                </View>
              }
            />
          </View>

          {/* Directory Tab */}
          <View style={{ display: viewMode === "directory" ? "flex" : "none", flex: 1 }}>
            <View style={styles.subHeader}>
              <View style={[styles.searchBar, { flex: 1 }]}>
                <Feather name="search" size={15} color="#8E9BAE" />
                <TextInput
                  placeholder="Rechercher un membre (nom ou @pseudo)..."
                  placeholderTextColor="#8E9BAE"
                  value={dirSearch}
                  onChangeText={setDirSearch}
                  autoCapitalize="none"
                  style={styles.searchInput}
                />
                {dirSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setDirSearch("")}>
                    <Feather name="x" size={15} color="#8E9BAE" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <FlatList
              data={directory.filter((u) => {
                if (!dirSearch.trim()) return true;
                const q = dirSearch.toLowerCase();
                return (
                  u.full_name?.toLowerCase().includes(q) ||
                  u.username?.toLowerCase().includes(q) ||
                  u.bio?.toLowerCase().includes(q)
                );
              })}
              keyExtractor={(item) => item.id}
              renderItem={renderDirItem}
              contentContainerStyle={{ paddingBottom: footerHeight + 24 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C5A03B" />
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="users" size={34} color="#8E9BAE" />
                  <Text style={styles.emptyText}>Aucun membre trouvé.</Text>
                </View>
              }
            />
          </View>

          {/* Public Feed Tab */}
          <View style={{ display: viewMode === "feed" ? "flex" : "none", flex: 1 }}>
            <PublicationsFeed
              user={user}
              onStartChat={(chatId) => {
                setViewMode("chats");
                fetchChats();
                router.push(`/chat/${chatId}` as any);
              }}
            />
          </View>

          {/* Admin Announcement Tab */}
          {user.username === "admin" && (
            <View
              style={{
                display: viewMode === "announce" ? "flex" : "none",
                flex: 1,
                padding: 16,
              }}
            >
              <View style={styles.announceCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <View style={styles.groupIconCircle}>
                    <Feather name="volume-2" size={18} color="#C5A03B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#C5A03B", fontSize: 16, fontWeight: "700" }}>
                      Annonce Officielle IQChat
                    </Text>
                    <Text style={{ color: "#8E9BAE", fontSize: 12 }}>
                      Envoie un message direct officiel à tous les utilisateurs inscrits.
                    </Text>
                  </View>
                </View>

                <TextInput
                  placeholder="Rédigez votre communication officielle..."
                  placeholderTextColor="#64748B"
                  value={announcementText}
                  onChangeText={setAnnouncementText}
                  multiline
                  style={styles.announceInput}
                />

                <TouchableOpacity
                  onPress={handleSendAnnouncement}
                  disabled={!announcementText.trim() || sendingAnnouncement}
                  style={[
                    styles.primaryActionBtn,
                    (!announcementText.trim() || sendingAnnouncement) && { opacity: 0.5 },
                  ]}
                >
                  {sendingAnnouncement ? (
                    <ActivityIndicator size="small" color="#0A1128" />
                  ) : (
                    <>
                      <Feather name="send" size={15} color="#0A1128" />
                      <Text style={styles.primaryActionBtnText}>Diffuser à tous</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Safe-Area Aware User Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => setShowSettings(true)}
          activeOpacity={0.75}
        >
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.userAvatar} />
          ) : (
            <View style={styles.groupIconCircle}>
              <Feather name="user" size={18} color="#C5A03B" />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {user.full_name || user.username}
              </Text>
              {user.quiet_hours_enabled && <Feather name="moon" size={12} color="#C5A03B" />}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
              <Feather name="settings" size={11} color="#C5A03B" />
              <Text style={styles.userStatus} numberOfLines={1}>
                {user.bio ? user.bio : "Paramètres & Préférences"}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            style={styles.footerIconBtn}
            accessibilityLabel="Paramètres"
          >
            <Feather name="sliders" size={18} color="#C5A03B" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirmLogout}
            style={[styles.footerIconBtn, { borderColor: "rgba(248,113,113,0.25)" }]}
            accessibilityLabel="Se déconnecter"
          >
            <Feather name="log-out" size={18} color="#f87171" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1128",
  },
  navBar: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    position: "relative",
  },
  activeToggle: {
    backgroundColor: "#C5A03B",
    borderColor: "#C5A03B",
  },
  toggleText: {
    color: "#CBD5E1",
    fontWeight: "700",
    fontSize: 12.5,
  },
  activeToggleText: {
    color: "#0A1128",
  },
  tabCountBadge: {
    backgroundColor: "#C5A03B",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  newFeedDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    backgroundColor: "#f43f5e",
    borderRadius: 4,
  },
  subHeader: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  searchBar: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 13.5,
    paddingVertical: 0,
  },
  newGroupBtn: {
    height: 42,
    backgroundColor: "#C5A03B",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    gap: 6,
  },
  newGroupBtnText: {
    color: "#0A1128",
    fontWeight: "700",
    fontSize: 13,
  },
  chatItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    gap: 12,
  },
  chatAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  groupIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(197,160,59,0.15)",
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  chatName: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  chatPreview: {
    color: "#8E9BAE",
    fontSize: 13,
    marginTop: 2,
  },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(197,160,59,0.14)",
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.3)",
  },
  unreadBadge: {
    backgroundColor: "#C5A03B",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    backgroundColor: "#4ade80",
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#0A1128",
  },
  onlineDotChatItem: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    backgroundColor: "#4ade80",
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#0A1128",
  },
  banBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: 56,
    gap: 10,
  },
  emptyText: {
    color: "#8E9BAE",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  announceCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.3)",
    gap: 12,
  },
  announceInput: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#FFF",
    padding: 14,
    minHeight: 110,
    textAlignVertical: "top",
    fontSize: 15,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0E1834",
    paddingTop: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  userInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.4)",
  },
  userName: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 15,
    flexShrink: 1,
  },
  userStatus: {
    color: "#C5A03B",
    fontSize: 12,
    flexShrink: 1,
  },
  footerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,9,22,0.82)",
    justifyContent: "flex-end",
  },
  groupModalCard: {
    backgroundColor: "#0E1834",
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(197,160,59,0.3)",
  },
  groupModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  groupModalTitle: {
    color: "#C5A03B",
    fontSize: 18,
    fontWeight: "700",
  },
  inputLabel: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: "rgba(0,0,0,0.3)",
    color: "#FFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    fontSize: 14.5,
  },
  memberSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionBtn: {
    height: 46,
    backgroundColor: "#C5A03B",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryActionBtnText: {
    color: "#0A1128",
    fontWeight: "700",
    fontSize: 14.5,
  },
});
