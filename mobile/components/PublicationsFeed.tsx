import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch } from "../lib/api";
import { PublicationSkeleton } from "./SkeletonLoader";

const MAX_CHARS = 500;

interface PublicationsFeedProps {
  user: any;
  onStartChat?: (chatId: string) => void;
}

export default function PublicationsFeed({ user, onStartChat }: PublicationsFeedProps) {
  const insets = useSafeAreaInsets();
  const [publications, setPublications] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareConfig, setShareConfig] = useState<{ pubId: string; content: string; author: string } | null>(null);
  const [repostTarget, setRepostTarget] = useState<any | null>(null);
  const [repostComment, setRepostComment] = useState("");
  const [myChats, setMyChats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const fontSize = user?.font_size === "compact" ? 13.5 : user?.font_size === "large" ? 17 : 15;

  const triggerHaptic = () => {
    if (user?.haptics_enabled !== false) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const fetchPublications = async () => {
    try {
      const res = await apiFetch("/publications/");
      if (res.ok) setPublications(await res.json());
    } catch {
      // silent
    } finally {
      setInitialLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchPublications();
      const interval = setInterval(fetchPublications, 60000);
      return () => clearInterval(interval);
    }, [user?.id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPublications();
    setRefreshing(false);
  };

  const loadChatsForSharing = async () => {
    try {
      const res = await apiFetch("/chats/");
      if (res.ok) setMyChats(await res.json());
    } catch {
      // silent
    }
  };

  const executeShare = async (chatId: string) => {
    if (!shareConfig) return;
    const shareText = `Publication de @${shareConfig.author} :\n"${shareConfig.content}"`;
    try {
      const res = await apiFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify({ chat_id: chatId, content: shareText }),
      });
      if (res.ok) {
        triggerHaptic();
        setShareConfig(null);
        Alert.alert("Partagé", "Publication partagée dans la discussion.");
      }
    } catch {
      Alert.alert("Erreur", "Impossible de partager la publication.");
    }
  };

  const submitRepost = async () => {
    if (!repostTarget) return;
    try {
      const res = await apiFetch("/publications/", {
        method: "POST",
        body: JSON.stringify({
          content: repostComment.trim() || "Publication partagée",
          repost_of_id: repostTarget.id,
        }),
      });
      if (res.ok) {
        triggerHaptic();
        setRepostTarget(null);
        setRepostComment("");
        fetchPublications();
      }
    } catch {
      Alert.alert("Erreur", "Impossible de republier pour le moment.");
    }
  };

  const handleMessageAuthor = async (authorUsername: string, authorFullName: string) => {
    if (!authorUsername || authorUsername === user?.username || !onStartChat) return;
    try {
      const res = await apiFetch("/chats/create", {
        method: "POST",
        body: JSON.stringify({
          type: "private",
          name: authorFullName || authorUsername,
          member_usernames: [authorUsername],
        }),
      });
      if (res.ok) {
        const chat = await res.json();
        if (chat?.id) {
          onStartChat(chat.id);
        }
      } else {
        const err = await res.json();
        Alert.alert("Information", err.detail || "Impossible d'ouvrir la discussion.");
      }
    } catch {
      Alert.alert("Erreur", "Erreur réseau lors de l'ouverture de la discussion.");
    }
  };

  const getChatDisplayName = (c: any) => {
    if (c.type === "group") return c.name;
    const other = c.members?.find((m: any) => m.user_id !== user.id);
    return other ? other.full_name || other.username : "Discussion privée";
  };

  const handleCopyText = async () => {
    if (!shareConfig) return;
    await Clipboard.setStringAsync(`@${shareConfig.author}: ${shareConfig.content}`);
    triggerHaptic();
    Alert.alert("Copié", "La publication a été copiée dans le presse-papiers.");
    setShareConfig(null);
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    if (content.length > MAX_CHARS) {
      Alert.alert("Limite atteinte", `Maximum ${MAX_CHARS} caractères.`);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/publications/", {
        method: "POST",
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        triggerHaptic();
        setContent("");
        fetchPublications();
      } else {
        const err = await res.json();
        Alert.alert("Erreur", err.detail || "Erreur de publication");
      }
    } catch {
      Alert.alert("Erreur", "Erreur réseau lors de la publication.");
    }
    setLoading(false);
  };

  const handleDeletePub = (id: string) => {
    Alert.alert("Supprimer", "Voulez-vous vraiment supprimer cette publication ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await apiFetch(`/publications/${id}`, { method: "DELETE" });
            if (res.ok) fetchPublications();
          } catch {
            // silent
          }
        },
      },
    ]);
  };

  const handleToggleLike = async (pub: any) => {
    const wasLiked = pub.user_reaction === true;
    triggerHaptic();
    setPublications((prev) =>
      prev.map((p) =>
        p.id === pub.id
          ? {
              ...p,
              user_reaction: wasLiked ? null : true,
              likes: Math.max(0, (p.likes || 0) + (wasLiked ? -1 : 1)),
            }
          : p
      )
    );

    try {
      await apiFetch(`/publications/${pub.id}/react`, {
        method: "POST",
        body: JSON.stringify({ is_like: wasLiked ? null : true }),
      });
    } catch {
      fetchPublications();
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`);
    return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const renderLinkedText = (text: string, size: number, color = "#FFF") => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = (text || "").split(urlRegex);
    return (
      <Text style={{ color, fontSize: size, lineHeight: size * 1.48 }}>
        {parts.map((part: string, i: number) => {
          if (part.match(/^https?:\/\//)) {
            return (
              <Text
                key={i}
                style={{ color: "#C5A03B", textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(part)}
              >
                {part}
              </Text>
            );
          }
          return part;
        })}
      </Text>
    );
  };

  const charsLeft = MAX_CHARS - content.length;
  const isOverLimit = charsLeft < 0;

  const filteredPublications = publications.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.content?.toLowerCase().includes(q) ||
      p.author_username?.toLowerCase().includes(q) ||
      p.author_full_name?.toLowerCase().includes(q) ||
      p.repost_original?.content?.toLowerCase().includes(q)
    );
  });

  const renderItem = ({ item }: { item: any }) => {
    const isOtherUser = item.author_id !== user?.id;

    return (
      <View
        style={[
          styles.card,
          { borderColor: item.is_pinned ? "#C5A03B" : "rgba(255,255,255,0.1)" },
        ]}
      >
        {item.is_pinned && (
          <View style={styles.pinnedBadge}>
            <Feather name="bookmark" size={11} color="#C5A03B" />
            <Text style={styles.pinnedText}>Épinglé</Text>
          </View>
        )}

        {item.repost_of_id && (
          <View style={styles.repostHeader}>
            <Feather name="repeat" size={12} color="#C5A03B" />
            <Text style={styles.repostHeaderText}>Republié par @{item.author_username}</Text>
          </View>
        )}

        <View style={[styles.authorRow, { marginTop: item.is_pinned ? 4 : 0 }]}>
          <TouchableOpacity
            activeOpacity={isOtherUser ? 0.7 : 1}
            disabled={!isOtherUser}
            onPress={() => handleMessageAuthor(item.author_username, item.author_full_name)}
            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
          >
            {item.author_avatar ? (
              <Image source={{ uri: item.author_avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }]}>
                <Feather name="user" size={18} color="#C5A03B" />
              </View>
            )}
            <View style={{ marginLeft: 12, flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.authorName} numberOfLines={1}>
                  {item.author_full_name || item.author_username}
                </Text>
                {item.is_supreme_admin && <Feather name="award" size={14} color="#C5A03B" />}
              </View>
              <Text style={styles.authorMeta}>
                @{item.author_username} • {formatDate(item.created_at)}
              </Text>
            </View>
          </TouchableOpacity>

          {isOtherUser && onStartChat && (
            <TouchableOpacity
              onPress={() => handleMessageAuthor(item.author_username, item.author_full_name)}
              style={styles.dmBtn}
              accessibilityLabel={`Discuter avec ${item.author_username}`}
            >
              <Feather name="message-square" size={15} color="#C5A03B" />
            </TouchableOpacity>
          )}
        </View>

        {item.content ? renderLinkedText(item.content, fontSize) : null}

        {/* Quoted Original Publication Card */}
        {item.repost_original && (
          <View style={styles.quotedCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
              {item.repost_original.author_avatar ? (
                <Image source={{ uri: item.repost_original.author_avatar }} style={{ width: 20, height: 20, borderRadius: 10 }} />
              ) : null}
              <Text style={{ color: "#C5A03B", fontSize: 12, fontWeight: "700" }}>
                {item.repost_original.author_full_name || item.repost_original.author_username}
              </Text>
              <Text style={{ color: "#8E9BAE", fontSize: 11 }}>@{item.repost_original.author_username}</Text>
            </View>
            {renderLinkedText(item.repost_original.content, Math.max(12.5, fontSize - 1.5), "#CBD5E1")}
          </View>
        )}

        {/* Action Row — Positive Toggleable Like + Repost + Share */}
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={() => handleToggleLike(item)} style={styles.actionBtn}>
            <Ionicons
              name={item.user_reaction === true ? "heart" : "heart-outline"}
              size={18}
              color={item.user_reaction === true ? "#f43f5e" : "#8E9BAE"}
            />
            <Text
              style={[
                styles.actionLabel,
                { color: item.user_reaction === true ? "#f43f5e" : "#8E9BAE" },
              ]}
            >
              {item.likes || 0}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setRepostTarget(item.repost_original ? { ...item.repost_original } : item);
              setRepostComment("");
            }}
            style={styles.actionBtn}
          >
            <Feather name="repeat" size={16} color="#8E9BAE" />
            <Text style={styles.actionLabel}>
              {item.reposts_count > 0 ? item.reposts_count : "Republier"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setShareConfig({ pubId: item.id, content: item.content, author: item.author_username });
              loadChatsForSharing();
            }}
            style={[styles.actionBtn, { marginLeft: "auto" }]}
          >
            <Feather name="share-2" size={16} color="#8E9BAE" />
            <Text style={styles.actionLabel}>Partager</Text>
          </TouchableOpacity>

          {(user?.username === "admin" || user?.id === item.author_id) && (
            <TouchableOpacity onPress={() => handleDeletePub(item.id)} style={[styles.actionBtn, { marginLeft: 8 }]}>
              <Feather name="trash-2" size={15} color="#f87171" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerBox}>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color="#8E9BAE" />
          <TextInput
            placeholder="Rechercher un texte, un sujet ou un auteur..."
            placeholderTextColor="#8E9BAE"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Feather name="x" size={16} color="#8E9BAE" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {initialLoading ? (
        <PublicationSkeleton />
      ) : (
        <FlatList
          data={filteredPublications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C5A03B" />}
          ListHeaderComponent={
            <View style={styles.composerCard}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {user?.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: "rgba(197,160,59,0.15)", alignItems: "center", justifyContent: "center" }]}>
                    <Feather name="user" size={18} color="#C5A03B" />
                  </View>
                )}
                <TextInput
                  placeholder="Partagez une réflexion calme avec la communauté..."
                  placeholderTextColor="#8E9BAE"
                  value={content}
                  onChangeText={setContent}
                  multiline
                  maxLength={MAX_CHARS + 50}
                  style={styles.composerInput}
                />
              </View>
              <View style={styles.composerFooter}>
                <Text
                  style={{
                    fontSize: 12,
                    color: isOverLimit ? "#ff4d4f" : charsLeft < 50 ? "#fbbf24" : "#8E9BAE",
                    fontWeight: isOverLimit ? "700" : "400",
                  }}
                >
                  {charsLeft} caractères restants
                </Text>
                <TouchableOpacity
                  onPress={handlePost}
                  disabled={loading || !content.trim() || isOverLimit}
                  style={[
                    styles.publishBtn,
                    { opacity: content.trim() && !isOverLimit && !loading ? 1 : 0.5 },
                  ]}
                >
                  <Feather name={loading ? "clock" : "send"} size={14} color="#0A1128" />
                  <Text style={styles.publishBtnText}>{loading ? "Envoi..." : "Publier"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 44, gap: 10 }}>
              <Feather name="inbox" size={34} color="#8E9BAE" />
              <Text style={{ color: "#8E9BAE", textAlign: "center" }}>
                {searchQuery ? "Aucune publication ne correspond à votre recherche." : "Aucune publication pour le moment."}
              </Text>
            </View>
          }
        />
      )}

      {/* Structured Repost Modal */}
      <Modal visible={!!repostTarget} transparent animationType="fade" onRequestClose={() => setRepostTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="repeat" size={18} color="#C5A03B" />
                <Text style={styles.modalTitle}>Republier sur le Fil Public</Text>
              </View>
              <TouchableOpacity onPress={() => setRepostTarget(null)}>
                <Feather name="x" size={18} color="#8E9BAE" />
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder="Ajouter un commentaire (optionnel)..."
              placeholderTextColor="#8E9BAE"
              value={repostComment}
              onChangeText={setRepostComment}
              multiline
              style={styles.repostInput}
            />

            {repostTarget && (
              <View style={styles.quotedCard}>
                <Text style={{ color: "#C5A03B", fontWeight: "700", fontSize: 12, marginBottom: 4 }}>
                  @{repostTarget.author_username}
                </Text>
                <Text style={{ color: "#CBD5E1", fontSize: 13 }} numberOfLines={3}>
                  {repostTarget.content}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={() => setRepostTarget(null)} style={styles.secondaryBtn}>
                <Text style={{ color: "#CBD5E1", fontWeight: "600" }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitRepost} style={styles.publishBtn}>
                <Feather name="repeat" size={14} color="#0A1128" />
                <Text style={styles.publishBtnText}>Republier</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Share Modal */}
      <Modal visible={!!shareConfig} transparent animationType="fade" onRequestClose={() => setShareConfig(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Partager dans une discussion</Text>
              <TouchableOpacity onPress={() => setShareConfig(null)}>
                <Feather name="x" size={18} color="#8E9BAE" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280, marginBottom: 14 }}>
              {myChats.map((c) => (
                <TouchableOpacity key={c.id} onPress={() => executeShare(c.id)} style={styles.shareChatRow}>
                  <View style={styles.shareChatIcon}>
                    <Feather name={c.type === "group" ? "users" : "user"} size={17} color="#C5A03B" />
                  </View>
                  <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 15, flex: 1 }} numberOfLines={1}>
                    {getChatDisplayName(c)}
                  </Text>
                  <Feather name="chevron-right" size={16} color="#8E9BAE" />
                </TouchableOpacity>
              ))}
              {myChats.length === 0 && (
                <Text style={{ color: "#8E9BAE", textAlign: "center", paddingVertical: 16 }}>
                  Aucune conversation active.
                </Text>
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <TouchableOpacity onPress={handleCopyText} style={styles.secondaryBtn}>
                <Feather name="copy" size={14} color="#FFF" />
                <Text style={{ color: "#FFF", fontWeight: "600" }}>Copier le texte</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShareConfig(null)} style={[styles.secondaryBtn, { backgroundColor: "transparent" }]}>
                <Text style={{ color: "#8E9BAE", fontWeight: "600" }}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBox: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchBar: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 14,
    paddingVertical: 0,
  },
  composerCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 20,
  },
  composerInput: {
    flex: 1,
    color: "#FFF",
    minHeight: 68,
    fontSize: 15,
    textAlignVertical: "top",
  },
  composerFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  publishBtn: {
    backgroundColor: "#C5A03B",
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  publishBtnText: {
    color: "#0A1128",
    fontWeight: "700",
    fontSize: 13,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    marginBottom: 14,
  },
  pinnedBadge: {
    position: "absolute",
    top: -10,
    left: 16,
    backgroundColor: "#0A1128",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.4)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pinnedText: {
    fontSize: 11,
    color: "#C5A03B",
    fontWeight: "700",
  },
  repostHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  repostHeaderText: {
    fontSize: 12,
    color: "#8E9BAE",
    fontWeight: "600",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  authorName: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 15,
  },
  authorMeta: {
    color: "#8E9BAE",
    fontSize: 12,
    marginTop: 1,
  },
  dmBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(197,160,59,0.12)",
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  quotedCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 14,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingTop: 12,
    gap: 18,
    alignItems: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionLabel: {
    color: "#8E9BAE",
    fontWeight: "600",
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,9,22,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#0E1834",
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(197,160,59,0.3)",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: {
    color: "#C5A03B",
    fontSize: 16,
    fontWeight: "700",
  },
  repostInput: {
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    color: "#FFF",
    padding: 12,
    minHeight: 74,
    textAlignVertical: "top",
    fontSize: 14,
  },
  secondaryBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shareChatRow: {
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  shareChatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(197,160,59,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
});
