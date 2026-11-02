import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Alert,
  Animated,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MessageBubble from "../../components/MessageBubble";
import MessageInput from "../../components/MessageInput";
import {
  getAuthData,
  apiFetch,
  getChatWsUrl,
  chatMemoryCache,
} from "../../lib/api";

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const chatId = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const cached = chatId ? chatMemoryCache[chatId] : undefined;
  const [user, setUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(cached ? cached.chatInfo : null);
  const [messages, setMessages] = useState<any[]>(cached ? cached.messages : []);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [externalDelayedUntil, setExternalDelayedUntil] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const initialScrolledRef = useRef<boolean>(false);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  // In-chat search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Typing indicator
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDots = useRef(new Animated.Value(0)).current;

  // Group members modal
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);

  useEffect(() => {
    initialScrolledRef.current = false;
    isNearBottomRef.current = true;
    setHasUnreadBelow(false);
  }, [chatId]);

  useEffect(() => {
    if (typingUser) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(typingDots, { toValue: 1, duration: 550, useNativeDriver: true }),
          Animated.timing(typingDots, { toValue: 0.35, duration: 550, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [typingUser, typingDots]);

  const fetchChat = useCallback(
    async (uid?: string) => {
      const activeUserId = uid || user?.id;
      if (!chatId || !activeUserId) return;
      try {
        const res = await apiFetch(`/chats/${chatId}`);
        if (res.ok) {
          const data = await res.json();
          chatMemoryCache[chatId] = { chatInfo: data, messages: data.messages || [] };
          setChatInfo(data);
          setMessages(data.messages || []);
          apiFetch(`/chats/${chatId}/read`, { method: "POST" }).catch(() => {});
        }
      } catch {
        // silent
      }
    },
    [chatId, user?.id]
  );

  useEffect(() => {
    if (showMembersModal && user) {
      apiFetch("/users/")
        .then((r) => (r.ok ? r.json() : []))
        .then(setDirectoryUsers)
        .catch(() => {});
    }
  }, [showMembersModal, user]);

  // In-chat search query effect
  useEffect(() => {
    if (!showSearch || !searchQuery.trim() || !chatId) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/messages/search?chat_id=${encodeURIComponent(chatId)}&q=${encodeURIComponent(searchQuery.trim())}`
        );
        if (res.ok) {
          setSearchResults(await res.json());
        }
      } catch {
        // silent
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [showSearch, searchQuery, chatId]);

  useEffect(() => {
    if (!chatId) return;
    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let chatPollInterval: ReturnType<typeof setInterval> | null = null;

    getAuthData().then((auth) => {
      if (!isMounted || !auth?.user) return;
      const parsed = auth.user;
      setUser(parsed);
      fetchChat(parsed.id);

      const connectWs = () => {
        if (!isMounted) return;
        ws = new WebSocket(getChatWsUrl(chatId, parsed.id, auth.token));
        wsRef.current = ws;

        ws.onopen = () => {
          if (isMounted) setIsConnected(true);
        };

        ws.onclose = () => {
          if (isMounted) {
            setIsConnected(false);
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = () => {
          if (isMounted) setIsConnected(false);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.event === "typing") {
              if (data.username !== parsed.username && data.is_typing) {
                setTypingUser(data.username);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
              } else if (data.username !== parsed.username) {
                setTypingUser(null);
              }
              return;
            }

            if (data.event === "read") {
              const ephMap = new Map<string, any>();
              if (Array.isArray(data.ephemeral_updates)) {
                for (const u of data.ephemeral_updates) {
                  ephMap.set(u.id, u);
                }
              }
              setMessages((prev) => {
                const updated = prev.map((m) => {
                  const eph = ephMap.get(m.id);
                  if (eph) {
                    return {
                      ...m,
                      is_read: true,
                      read_at: eph.read_at,
                      expires_at: eph.expires_at,
                    };
                  }
                  if (m.sender_id === parsed.id && data.reader_id !== parsed.id) {
                    return { ...m, is_read: true };
                  }
                  return m;
                });
                if (chatMemoryCache[chatId]) {
                  chatMemoryCache[chatId].messages = updated;
                }
                return updated;
              });
              return;
            }

            if (data.event === "message_deleted" && data.message_id) {
              setMessages((prev) => {
                const updated = prev.filter((m) => m.id !== data.message_id);
                if (chatMemoryCache[chatId]) {
                  chatMemoryCache[chatId].messages = updated;
                }
                return updated;
              });
              return;
            }

            // Standard message or message update
            if (!data.id) return;
            const fromMe = data.sender_id === parsed.id;

            // Mask anonymous identity for non-authors, keep for author
            const normalized =
              data.is_anonymous && data.sender_id && data.sender_id !== parsed.id
                ? {
                    ...data,
                    sender_id: null,
                    sender_username: "Anonyme",
                    sender_name: "Membre Anonyme",
                    is_own_anonymous: false,
                  }
                : data.is_anonymous && data.sender_id === parsed.id
                ? { ...data, is_own_anonymous: true }
                : data;

            let isBrandNewAppend = false;
            setMessages((prev) => {
              const existingIdx = prev.findIndex((m) => m.id === normalized.id);
              let nextMsgs: any[];
              if (existingIdx !== -1) {
                nextMsgs = [...prev];
                nextMsgs[existingIdx] = { ...prev[existingIdx], ...normalized };
              } else if (fromMe) {
                const optIdx = prev.findIndex(
                  (m) => m.status === "sending" && m.content === normalized.content
                );
                if (optIdx !== -1) {
                  nextMsgs = [...prev];
                  nextMsgs[optIdx] = normalized;
                } else {
                  isBrandNewAppend = true;
                  nextMsgs = [...prev, normalized];
                }
              } else {
                isBrandNewAppend = true;
                nextMsgs = [...prev, normalized];
              }

              if (chatMemoryCache[chatId]) {
                chatMemoryCache[chatId].messages = nextMsgs;
              }
              return nextMsgs;
            });

            if (!fromMe && isBrandNewAppend) {
              apiFetch(`/chats/${chatId}/read`, { method: "POST" }).catch(() => {});
            }

            if (isBrandNewAppend) {
              if (fromMe || isNearBottomRef.current) {
                setTimeout(() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }, 80);
              } else {
                setHasUnreadBelow(true);
              }
            }
          } catch {
            // ignore non-json frames
          }
        };
      };

      connectWs();

      chatPollInterval = setInterval(() => {
        fetchChat(parsed.id);
      }, 30000);
    });

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (chatPollInterval) clearInterval(chatPollInterval);
      if (ws) ws.close();
      wsRef.current = null;
    };
  }, [chatId, fetchChat]);

  const sendTypingEvent = useCallback(
    (isTyping: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && user) {
        wsRef.current.send(
          JSON.stringify({
            event: "typing",
            username: user.username || user.full_name,
            is_typing: isTyping,
          })
        );
      }
    },
    [user]
  );

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nearBottom = distanceFromBottom < 140;
    isNearBottomRef.current = nearBottom;
    if (nearBottom && hasUnreadBelow) {
      setHasUnreadBelow(false);
    }
  };

  const scrollToBottom = (animated = true) => {
    flatListRef.current?.scrollToEnd({ animated });
    setHasUnreadBelow(false);
    isNearBottomRef.current = true;
  };

  const scrollToMessageId = (targetId: string) => {
    const idx = messages.findIndex((m) => m.id === targetId);
    if (idx !== -1) {
      setShowSearch(false);
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.4 });
      }, 100);
    }
  };

  const handleSend = async (msgData: any) => {
    if (!user || !chatId) return;
    sendTypingEvent(false);

    const activeReply = replyingTo;
    setReplyingTo(null);
    setExternalDelayedUntil(null);

    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      id: tempId,
      chat_id: chatId,
      sender_id: user.id,
      sender_username: user.username,
      sender_name: user.full_name || user.username,
      content: msgData.content || "",
      file_url: msgData.file_url || null,
      file_type: msgData.file_type || null,
      file_name: msgData.file_name || null,
      created_at: new Date().toISOString(),
      type: msgData.type || "text",
      visible_at: msgData.visible_at || null,
      expires_at: msgData.expires_at || null,
      ephemeral_seconds: msgData.ephemeral_seconds || null,
      reply_to_id: msgData.reply_to_id || activeReply?.id || null,
      reply_to_sender: activeReply
        ? activeReply.is_anonymous
          ? "Anonyme"
          : activeReply.sender_name || activeReply.sender_username
        : null,
      reply_to_content: activeReply?.content || null,
      is_anonymous: msgData.is_anonymous || false,
      is_own_anonymous: msgData.is_anonymous || false,
      reactions: [],
      status: "sending",
    };

    setMessages((prev) => {
      const nextMsgs = [...prev, tempMessage];
      if (chatMemoryCache[chatId]) {
        chatMemoryCache[chatId].messages = nextMsgs;
      }
      return nextMsgs;
    });

    setTimeout(() => scrollToBottom(true), 80);

    try {
      const res = await apiFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify({
          chat_id: chatId,
          ...msgData,
          reply_to_id: msgData.reply_to_id || activeReply?.id || undefined,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setMessages((prev) => {
          const alreadyReplaced = prev.some((m) => m.id === saved.id);
          const nextMsgs = alreadyReplaced
            ? prev.filter((m) => m.id !== tempId)
            : prev.map((m) => (m.id === tempId ? { ...saved, is_own_anonymous: !!saved.is_anonymous } : m));
          if (chatMemoryCache[chatId]) {
            chatMemoryCache[chatId].messages = nextMsgs;
          }
          return nextMsgs;
        });
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
      );
    }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    try {
      await apiFetch(`/messages/${msgId}/reaction`, {
        method: "PUT",
        body: JSON.stringify({ emoji }),
      });
    } catch {
      // silent
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== msgId);
      if (chatId && chatMemoryCache[chatId]) {
        chatMemoryCache[chatId].messages = next;
      }
      return next;
    });
    try {
      await apiFetch(`/messages/${msgId}`, { method: "DELETE" });
    } catch {
      fetchChat();
    }
  };

  const handleAccept = async () => {
    try {
      const res = await apiFetch(`/chats/${chatId}/accept`, { method: "PATCH" });
      if (res.ok) {
        await fetchChat();
      }
    } catch {
      // silent
    }
  };

  const handleDecline = () => {
    Alert.alert(
      "Décliner l'invitation",
      "Voulez-vous refuser cette demande de discussion ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Décliner",
          style: "destructive",
          onPress: async () => {
            try {
              await apiFetch(`/chats/${chatId}/decline`, { method: "POST" });
              delete chatMemoryCache[chatId];
              router.back();
            } catch {
              // silent
            }
          },
        },
      ]
    );
  };

  const handleAddMembers = async () => {
    if (selectedUsernames.length === 0) return;
    try {
      const res = await apiFetch(`/chats/${chatId}/add_members`, {
        method: "POST",
        body: JSON.stringify({ member_usernames: selectedUsernames }),
      });
      if (res.ok) {
        setShowMembersModal(false);
        setSelectedUsernames([]);
        setMemberSearch("");
        await fetchChat();
      }
    } catch {
      // silent
    }
  };

  const handleLeaveChat = () => {
    Alert.alert(
      isPrivate ? "Masquer la conversation" : "Quitter le groupe",
      isPrivate
        ? "Cette action retirera la conversation de votre liste."
        : "Vous ne ferez plus partie de ce groupe.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          style: "destructive",
          onPress: async () => {
            await apiFetch(`/chats/${chatId}/leave`, { method: "DELETE" });
            delete chatMemoryCache[chatId];
            router.back();
          },
        },
      ]
    );
  };

  const handleDeleteChat = () => {
    Alert.alert(
      "Supprimer le groupe",
      "Cette action supprimera définitivement le groupe pour tous les participants.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            await apiFetch(`/chats/${chatId}`, { method: "DELETE" });
            delete chatMemoryCache[chatId];
            router.back();
          },
        },
      ]
    );
  };

  const handleKickMember = (targetId: string, targetName: string) => {
    Alert.alert("Retirer du groupe", `Retirer ${targetName} de ce groupe ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          const res = await apiFetch(`/chats/${chatId}/members/${targetId}`, {
            method: "DELETE",
          });
          if (res.ok) fetchChat();
        },
      },
    ]);
  };

  const scheduleAtQuietHoursEnd = (endHHMM: string) => {
    const [hStr, mStr] = (endHHMM || "08:00").split(":");
    const target = new Date();
    target.setHours(parseInt(hStr || "8", 10), parseInt(mStr || "0", 10), 0, 0);
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1);
    }
    setExternalDelayedUntil(target.toISOString());
  };

  const isPrivate = chatInfo?.type === "private";
  const otherMember = isPrivate
    ? chatInfo?.members?.find((m: any) => m.user_id !== user?.id)
    : null;
  const amIAdmin =
    chatInfo?.members?.find((m: any) => m.user_id === user?.id)?.role === "admin";
  const isPending = chatInfo?.status === "pending";

  const headerTitle = isPrivate
    ? otherMember
      ? otherMember.full_name || otherMember.username
      : "Discussion"
    : chatInfo?.name || "Groupe";

  const subtitleText = isPrivate
    ? otherMember?.is_in_quiet_hours
      ? `Mode Quiétude (jusqu'à ${otherMember.quiet_hours_end || "08:00"})`
      : otherMember?.is_online
      ? "En ligne"
      : otherMember?.bio || `@${otherMember?.username || ""}`
    : `${chatInfo?.members?.length || 0} participant(s)`;

  const addableUsers = directoryUsers.filter((u) => {
    if (u.id === user?.id || u.is_banned) return false;
    if (chatInfo?.members?.some((m: any) => m.user_id === u.id)) return false;
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q)
    );
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: headerTitle,
          headerStyle: { backgroundColor: "#0E1834" },
          headerTintColor: "#C5A03B",
          headerTitle: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 210 }}>
              {isPrivate && otherMember?.avatar_url ? (
                <TouchableOpacity onPress={() => setViewImage(otherMember.avatar_url)}>
                  <View style={{ position: "relative" }}>
                    <Image
                      source={{ uri: otherMember.avatar_url }}
                      style={{ width: 36, height: 36, borderRadius: 18 }}
                    />
                    {otherMember.is_online && <View style={styles.headerOnlineDot} />}
                  </View>
                </TouchableOpacity>
              ) : !isPrivate ? (
                <TouchableOpacity
                  onPress={() => setShowMembersModal(true)}
                  style={styles.headerGroupBadge}
                >
                  <Feather name="users" size={16} color="#C5A03B" />
                </TouchableOpacity>
              ) : null}

              <View style={{ flexShrink: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={styles.headerTitleText} numberOfLines={1}>
                    {headerTitle}
                  </Text>
                  {!isPrivate && amIAdmin && (
                    <Feather name="award" size={13} color="#C5A03B" />
                  )}
                </View>
                {subtitleText ? (
                  <Text
                    style={[
                      styles.headerSubtitle,
                      isPrivate && otherMember?.is_online && !otherMember?.is_in_quiet_hours
                        ? { color: "#4ade80" }
                        : null,
                    ]}
                    numberOfLines={1}
                  >
                    {subtitleText}
                  </Text>
                ) : null}
              </View>
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => {
                  setShowSearch((prev) => !prev);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                style={[
                  styles.headerIconBtn,
                  showSearch && { backgroundColor: "rgba(197,160,59,0.2)" },
                ]}
              >
                <Feather name="search" size={17} color="#C5A03B" />
              </TouchableOpacity>

              {!isPrivate && (
                <TouchableOpacity
                  onPress={() => setShowMembersModal(true)}
                  style={styles.headerIconBtn}
                >
                  <Feather name={amIAdmin ? "user-plus" : "users"} size={17} color="#C5A03B" />
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={handleLeaveChat} style={styles.headerIconBtn}>
                <Feather name="log-out" size={17} color="#8E9BAE" />
              </TouchableOpacity>

              {!isPrivate && amIAdmin && (
                <TouchableOpacity onPress={handleDeleteChat} style={styles.headerIconBtn}>
                  <Feather name="trash-2" size={17} color="#f87171" />
                </TouchableOpacity>
              )}
            </View>
          ),
        }}
      />

      {/* Disconnected Banner */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={14} color="#f87171" />
          <Text style={styles.offlineText}>Connexion interrompue. Reconnexion en cours...</Text>
        </View>
      )}

      {/* In-Chat Search Panel */}
      {showSearch && (
        <View style={styles.searchPanel}>
          <View style={styles.searchInputRow}>
            <Feather name="search" size={15} color="#8E9BAE" />
            <TextInput
              placeholder="Rechercher dans cette conversation..."
              placeholderTextColor="#8E9BAE"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              style={styles.searchInput}
            />
            <TouchableOpacity
              onPress={() => {
                setShowSearch(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
            >
              <Feather name="x" size={16} color="#8E9BAE" />
            </TouchableOpacity>
          </View>

          {searchQuery.trim().length > 0 && (
            <ScrollView style={{ maxHeight: 170, marginTop: 8 }}>
              {searchResults.map((resMsg) => (
                <TouchableOpacity
                  key={resMsg.id}
                  onPress={() => scrollToMessageId(resMsg.id)}
                  style={styles.searchResultRow}
                >
                  <Text style={{ color: "#C5A03B", fontSize: 11, fontWeight: "700" }}>
                    {resMsg.sender_name || resMsg.sender_username || "Message"}
                  </Text>
                  <Text style={{ color: "#E2E8F0", fontSize: 13 }} numberOfLines={1}>
                    {resMsg.content}
                  </Text>
                </TouchableOpacity>
              ))}
              {searchResults.length === 0 && (
                <Text style={{ color: "#8E9BAE", fontSize: 12, textAlign: "center", paddingVertical: 8 }}>
                  Aucun message trouvé.
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* Quiet Hours Calm Banner */}
      {isPrivate && otherMember?.is_in_quiet_hours && !isPending && (
        <View style={styles.quietBanner}>
          <Feather name="moon" size={15} color="#C5A03B" />
          <Text style={styles.quietBannerText} numberOfLines={2}>
            {otherMember.full_name || otherMember.username} est en mode Quiétude jusqu&apos;à{" "}
            {otherMember.quiet_hours_end || "08:00"}.
          </Text>
          <TouchableOpacity
            onPress={() => scheduleAtQuietHoursEnd(otherMember.quiet_hours_end || "08:00")}
            style={styles.quietScheduleBtn}
          >
            <Feather name="clock" size={12} color="#0A1128" />
            <Text style={styles.quietScheduleBtnText}>
              {otherMember.quiet_hours_end || "08:00"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages List (Scroll-Lock Free) */}
      <View style={{ flex: 1, position: "relative" }}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (!initialScrolledRef.current && messages.length > 0) {
              initialScrolledRef.current = true;
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isOwn={user ? item.sender_id === user.id || !!item.is_own_anonymous : false}
              currentUserId={user?.id || ""}
              userSettings={user}
              onReaction={(msgId: string, emoji: string) => handleReaction(msgId, emoji)}
              onReply={() => setReplyingTo(item)}
              onDelete={handleDeleteMessage}
              onViewImage={(url: string) => setViewImage(url)}
              onUnlockRefresh={() => fetchChat()}
            />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          ListFooterComponent={
            typingUser ? (
              <View style={styles.typingRow}>
                <Animated.View style={[styles.typingBubble, { opacity: typingDots }]}>
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                </Animated.View>
                <Text style={styles.typingLabel}>{typingUser} écrit...</Text>
              </View>
            ) : null
          }
        />

        {/* Floating Unread / Scroll-to-Bottom Pill */}
        {hasUnreadBelow && (
          <TouchableOpacity
            onPress={() => scrollToBottom(true)}
            style={styles.unreadPillBtn}
            activeOpacity={0.85}
          >
            <Feather name="arrow-down" size={14} color="#0A1128" />
            <Text style={styles.unreadPillText}>Nouveaux messages</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Group Members & Add Members Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={showMembersModal}
        onRequestClose={() => setShowMembersModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="users" size={18} color="#C5A03B" />
                <Text style={styles.modalTitle}>
                  Participants ({chatInfo?.members?.length || 0})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowMembersModal(false)}>
                <Feather name="x" size={20} color="#8E9BAE" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 160, marginBottom: 14 }}>
              {chatInfo?.members?.map((m: any) => (
                <View key={m.user_id} style={styles.memberRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    {m.avatar_url ? (
                      <Image
                        source={{ uri: m.avatar_url }}
                        style={{ width: 30, height: 30, borderRadius: 15 }}
                      />
                    ) : (
                      <View style={styles.smallIconAvatar}>
                        <Feather name="user" size={14} color="#C5A03B" />
                      </View>
                    )}
                    <Text style={{ color: "#FFF", fontWeight: "600" }} numberOfLines={1}>
                      {m.full_name || m.username}
                    </Text>
                    {m.role === "admin" && <Feather name="award" size={13} color="#C5A03B" />}
                  </View>
                  {!isPrivate && amIAdmin && m.user_id !== user?.id && (
                    <TouchableOpacity
                      onPress={() => handleKickMember(m.user_id, m.full_name || m.username)}
                      style={styles.kickBtn}
                    >
                      <Feather name="user-minus" size={13} color="#f87171" />
                      <Text style={{ color: "#f87171", fontSize: 12, fontWeight: "600" }}>
                        Retirer
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            {amIAdmin && (
              <>
                <Text style={[styles.modalTitle, { fontSize: 15, marginBottom: 8 }]}>
                  Ajouter depuis l&apos;annuaire
                </Text>
                <View style={[styles.searchInputRow, { marginBottom: 10 }]}>
                  <Feather name="search" size={14} color="#8E9BAE" />
                  <TextInput
                    placeholder="Rechercher un utilisateur..."
                    placeholderTextColor="#8E9BAE"
                    value={memberSearch}
                    onChangeText={setMemberSearch}
                    autoCapitalize="none"
                    style={styles.searchInput}
                  />
                </View>

                <ScrollView style={{ maxHeight: 180, marginBottom: 14 }}>
                  {addableUsers.map((c) => {
                    const isSelected = selectedUsernames.includes(c.username);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() =>
                          setSelectedUsernames((prev) =>
                            isSelected
                              ? prev.filter((u) => u !== c.username)
                              : [...prev, c.username]
                          )
                        }
                        style={[
                          styles.addableRow,
                          isSelected && {
                            borderColor: "#C5A03B",
                            backgroundColor: "rgba(197,160,59,0.15)",
                          },
                        ]}
                      >
                        <Text style={{ color: "#FFF", fontSize: 14, flex: 1 }}>
                          {c.full_name || c.username}{" "}
                          <Text style={{ color: "#8E9BAE", fontSize: 12 }}>@{c.username}</Text>
                        </Text>
                        {isSelected && <Feather name="check" size={15} color="#C5A03B" />}
                      </TouchableOpacity>
                    );
                  })}
                  {addableUsers.length === 0 && (
                    <Text style={{ color: "#8E9BAE", textAlign: "center", paddingVertical: 12 }}>
                      Aucun autre utilisateur disponible.
                    </Text>
                  )}
                </ScrollView>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={styles.cancelModalBtn}
                    onPress={() => setShowMembersModal(false)}
                  >
                    <Text style={{ color: "#CBD5E1", fontWeight: "600" }}>Fermer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.confirmModalBtn,
                      selectedUsernames.length === 0 && { opacity: 0.45 },
                    ]}
                    onPress={handleAddMembers}
                    disabled={selectedUsernames.length === 0}
                  >
                    <Feather name="user-plus" size={15} color="#0A1128" />
                    <Text style={{ color: "#0A1128", fontWeight: "700" }}>
                      Ajouter ({selectedUsernames.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Composer or Pending Invitation Bar */}
      {user &&
        (isPending ? (
          <View
            style={[
              styles.pendingContainer,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            {amIAdmin ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="clock" size={16} color="#C5A03B" />
                <Text style={{ color: "#CBD5E1", fontSize: 13.5 }}>
                  Invitation envoyée. En attente d&apos;acceptation...
                </Text>
              </View>
            ) : (
              <View style={{ alignItems: "center", gap: 12, width: "100%" }}>
                <Text style={{ color: "#E2E8F0", fontSize: 14, textAlign: "center" }}>
                  Ce membre souhaite démarrer une conversation privée avec vous.
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity onPress={handleDecline} style={styles.declineInviteBtn}>
                    <Feather name="x" size={15} color="#f87171" />
                    <Text style={{ color: "#f87171", fontWeight: "700" }}>Décliner</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleAccept} style={styles.acceptInviteBtn}>
                    <Feather name="check" size={15} color="#0A1128" />
                    <Text style={{ color: "#0A1128", fontWeight: "700" }}>Accepter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <MessageInput
            user={user}
            onSend={handleSend}
            onTyping={sendTypingEvent}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            externalDelayedUntil={externalDelayedUntil}
            onClearExternalDelay={() => setExternalDelayedUntil(null)}
          />
        ))}

      {/* Built-in Fullscreen Image Lightbox */}
      <Modal
        transparent
        animationType="fade"
        visible={!!viewImage}
        onRequestClose={() => setViewImage(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <TouchableOpacity
            onPress={() => setViewImage(null)}
            style={[styles.lightboxCloseBtn, { top: Math.max(insets.top + 12, 24) }]}
          >
            <Feather name="x" size={22} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, width: "100%", justifyContent: "center", alignItems: "center" }}
            activeOpacity={1}
            onPress={() => setViewImage(null)}
          >
            {viewImage ? (
              <Image
                source={{ uri: viewImage }}
                style={{ width: "96%", height: "82%", resizeMode: "contain" }}
              />
            ) : null}
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1128",
  },
  headerOnlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4ade80",
    borderWidth: 1.5,
    borderColor: "#0E1834",
  },
  headerGroupBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(197,160,59,0.15)",
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  headerSubtitle: {
    color: "#8E9BAE",
    fontSize: 11.5,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  offlineBanner: {
    backgroundColor: "rgba(239,68,68,0.14)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderColor: "rgba(239,68,68,0.28)",
  },
  offlineText: {
    color: "#f87171",
    fontSize: 12.5,
    fontWeight: "600",
  },
  searchPanel: {
    backgroundColor: "#0E1834",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "rgba(197,160,59,0.25)",
  },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 13.5,
    paddingVertical: 0,
  },
  searchResultRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 6,
  },
  quietBanner: {
    backgroundColor: "rgba(197,160,59,0.1)",
    borderBottomWidth: 1,
    borderColor: "rgba(197,160,59,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quietBannerText: {
    flex: 1,
    color: "#E2E8F0",
    fontSize: 12,
  },
  quietScheduleBtn: {
    backgroundColor: "#C5A03B",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quietScheduleBtnText: {
    color: "#0A1128",
    fontWeight: "700",
    fontSize: 11.5,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  typingBubble: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderBottomLeftRadius: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C5A03B",
  },
  typingLabel: {
    fontSize: 12,
    color: "#C5A03B",
    fontStyle: "italic",
  },
  unreadPillBtn: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    backgroundColor: "#C5A03B",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    elevation: 5,
  },
  unreadPillText: {
    color: "#0A1128",
    fontWeight: "700",
    fontSize: 12.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,9,22,0.82)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0E1834",
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(197,160,59,0.3)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    color: "#C5A03B",
    fontSize: 17,
    fontWeight: "700",
  },
  memberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    marginBottom: 6,
  },
  smallIconAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(197,160,59,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  kickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(248,113,113,0.12)",
  },
  addableRow: {
    padding: 11,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    alignItems: "center",
  },
  confirmModalBtn: {
    flex: 1.4,
    paddingVertical: 12,
    backgroundColor: "#C5A03B",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pendingContainer: {
    paddingTop: 16,
    paddingHorizontal: 20,
    backgroundColor: "#0E1834",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  declineInviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.4)",
    backgroundColor: "rgba(248,113,113,0.1)",
  },
  acceptInviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#C5A03B",
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxCloseBtn: {
    position: "absolute",
    right: 18,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
