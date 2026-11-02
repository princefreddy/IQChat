import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Switch,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, uploadFile, clearChatMemoryCache, getUploadUrl } from "../lib/api";

type TabKey = "profile" | "slow" | "privacy" | "appearance" | "account";

interface SettingsModalProps {
  visible: boolean;
  user: any;
  onClose: () => void;
  onSave: (updatedUser: any) => void;
  onLogout: () => void;
}

export default function SettingsModal({ visible, user, onClose, onSave, onLogout }: SettingsModalProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  // 1. Profile
  const [fullName, setFullName] = useState<string>(user?.full_name || "");
  const [avatarUrl, setAvatarUrl] = useState<string>(user?.avatar_url || "");
  const [bio, setBio] = useState<string>(user?.bio || "");

  // 2. Quietude / Slow Comm
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(!!user?.quiet_hours_enabled);
  const [quietHoursStart, setQuietHoursStart] = useState<string>(user?.quiet_hours_start || "22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState<string>(user?.quiet_hours_end || "08:00");
  const [defaultEphemeralTtl, setDefaultEphemeralTtl] = useState<number>(user?.default_ephemeral_ttl || 10);
  const [autoResetMode, setAutoResetMode] = useState<boolean>(user?.auto_reset_mode !== false);

  // 3. Privacy & Security
  const [showOnlineStatus, setShowOnlineStatus] = useState<boolean>(user?.show_online_status !== false);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState<boolean>(user?.read_receipts_enabled !== false);
  const [allowDmRequests, setAllowDmRequests] = useState<boolean>(user?.allow_dm_requests !== false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 4. Display & Comfort
  const [fontSize, setFontSize] = useState<string>(user?.font_size || "normal");
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(user?.haptics_enabled !== false);
  const [linkPreviewsEnabled, setLinkPreviewsEnabled] = useState<boolean>(user?.link_previews_enabled !== false);

  // 5. Account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const triggerHaptic = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePickAvatar = async () => {
    if (uploadingAvatar) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setUploadingAvatar(true);
        try {
          const asset = result.assets[0];
          const rawExt = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() || "jpg";
          const ext = ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(rawExt) ? rawExt : "jpg";
          const fileName = `avatar_${Date.now()}.${ext}`;
          const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          const uploaded = await uploadFile(asset.uri, fileName, mimeType);
          setAvatarUrl(getUploadUrl(uploaded.url));
        } catch (err: any) {
          Alert.alert("Erreur", err.message || "Impossible de téléverser la photo de profil.");
        } finally {
          setUploadingAvatar(false);
        }
      }
    } catch (err: any) {
      Alert.alert("Erreur", err?.message || "Impossible d'ouvrir la photothèque.");
    }
  };

  const handleRandomAvatar = () => {
    triggerHaptic();
    const seed = `${user.username}_${Math.random().toString(36).slice(2, 7)}`;
    setAvatarUrl(`https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(seed)}`);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert("Champ requis", "Votre nom complet ne peut pas être vide.");
      return;
    }
    if (password) {
      if (password.length < 6) {
        Alert.alert("Mot de passe trop court", "Le nouveau mot de passe doit contenir au moins 6 caractères.");
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert("Erreur", "La confirmation du mot de passe ne correspond pas.");
        return;
      }
    }

    setSaving(true);
    try {
      const payload: any = {
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
        haptics_enabled: hapticsEnabled,
        link_previews_enabled: linkPreviewsEnabled,
      };
      if (password) {
        payload.password = password;
        if (currentPassword) payload.current_password = currentPassword;
      }

      const res = await apiFetch("/users/me", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setPassword("");
        setConfirmPassword("");
        setCurrentPassword("");
        if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSave(updated);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Erreur", err.detail || "Échec de l'enregistrement des paramètres.");
      }
    } catch {
      Alert.alert("Erreur réseau", "Vérifiez votre connexion et réessayez.");
    }
    setSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "SUPPRIMER") return;
    try {
      const res = await apiFetch("/users/me", { method: "DELETE" });
      if (res.ok) {
        onLogout();
      } else {
        Alert.alert("Erreur", "Impossible de supprimer le compte.");
      }
    } catch {
      Alert.alert("Erreur réseau", "Impossible de joindre le serveur.");
    }
  };

  const tabs: { key: TabKey; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "profile", label: "Profil", icon: "user" },
    { key: "slow", label: "Quiétude", icon: "moon" },
    { key: "privacy", label: "Sécurité", icon: "shield" },
    { key: "appearance", label: "Affichage", icon: "sliders" },
    { key: "account", label: "Compte", icon: "lock" },
  ];

  const renderSwitchRow = (title: string, subtitle: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          triggerHaptic();
          onChange(v);
        }}
        trackColor={{ false: "rgba(255,255,255,0.14)", true: "rgba(197, 160, 59, 0.55)" }}
        thumbColor={value ? "#C5A03B" : "#94A3B8"}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name="settings" size={20} color="#C5A03B" />
              <Text style={styles.headerTitle}>Paramètres</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Horizontal Section Tabs */}
          <View style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsBar}>
              {tabs.map((t) => {
                const active = activeTab === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => {
                      triggerHaptic();
                      setActiveTab(t.key);
                    }}
                    style={[styles.tabPill, active && styles.tabPillActive]}
                  >
                    <Feather name={t.icon} size={14} color={active ? "#0A1128" : "#94A3B8"} />
                    <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Body */}
          <ScrollView style={styles.body} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            {activeTab === "profile" && (
              <>
                <View style={styles.avatarCard}>
                  <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} style={{ position: "relative" }}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                    ) : (
                      <View style={[styles.avatarImg, { backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" }]}>
                        <Feather name="camera" size={28} color="#C5A03B" />
                      </View>
                    )}
                    {uploadingAvatar && (
                      <View style={styles.avatarLoading}>
                        <ActivityIndicator size="small" color="#C5A03B" />
                      </View>
                    )}
                    <View style={styles.avatarEditBadge}>
                      <Feather name="edit-2" size={12} color="#0A1128" />
                    </View>
                  </TouchableOpacity>

                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 16 }}>{fullName || user?.username}</Text>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <TouchableOpacity onPress={handlePickAvatar} style={styles.smallOutlineBtn}>
                        <Feather name="image" size={13} color="#C5A03B" />
                        <Text style={styles.smallOutlineText}>Galerie</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleRandomAvatar} style={styles.smallOutlineBtn}>
                        <Feather name="refresh-cw" size={13} color="#C5A03B" />
                        <Text style={styles.smallOutlineText}>Aléatoire</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View>
                  <Text style={styles.label}>Nom d&apos;affichage</Text>
                  <TextInput
                    style={styles.input}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Votre nom complet"
                    placeholderTextColor="#64748B"
                  />
                </View>

                <View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={[styles.label, { marginBottom: 0 }]}>Statut d&apos;intention / Bio</Text>
                    <Text style={{ color: "#64748B", fontSize: 11 }}>{bio.length}/160</Text>
                  </View>
                  <TextInput
                    style={[styles.input, { minHeight: 68, textAlignVertical: "top" }]}
                    value={bio}
                    onChangeText={(t) => setBio(t.slice(0, 160))}
                    multiline
                    maxLength={160}
                    placeholder="Ex : Disponible en soirée, réponses posées..."
                    placeholderTextColor="#64748B"
                  />
                </View>

                <View style={styles.infoBox}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View>
                      <Text style={{ color: "#94A3B8", fontSize: 11 }}>Identifiant unique</Text>
                      <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 14 }}>@{user?.username}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={async () => {
                        await Clipboard.setStringAsync(`@${user?.username}`);
                        Alert.alert("Copié", `@${user?.username} copié dans le presse-papier.`);
                      }}
                      style={styles.smallOutlineBtn}
                    >
                      <Feather name="copy" size={13} color="#C5A03B" />
                      <Text style={styles.smallOutlineText}>Copier</Text>
                    </TouchableOpacity>
                  </View>
                  {user?.email ? (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
                      <Text style={{ color: "#94A3B8", fontSize: 11 }}>Email associé</Text>
                      <Text style={{ color: "#E2E8F0", fontSize: 13 }}>{user.email}</Text>
                    </View>
                  ) : null}
                </View>
              </>
            )}

            {activeTab === "slow" && (
              <>
                {renderSwitchRow(
                  "Mode Quiétude (Heures de repos)",
                  "Indique aux correspondants que vous êtes au repos et leur propose un envoi programmé.",
                  quietHoursEnabled,
                  setQuietHoursEnabled
                )}

                {quietHoursEnabled && (
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Début (HH:MM)</Text>
                      <TextInput
                        style={styles.input}
                        value={quietHoursStart}
                        onChangeText={setQuietHoursStart}
                        placeholder="22:00"
                        placeholderTextColor="#64748B"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Réveil (HH:MM)</Text>
                      <TextInput
                        style={styles.input}
                        value={quietHoursEnd}
                        onChangeText={setQuietHoursEnd}
                        placeholder="08:00"
                        placeholderTextColor="#64748B"
                      />
                    </View>
                  </View>
                )}

                {renderSwitchRow(
                  "Réinitialisation auto du mode d'envoi",
                  "Revient automatiquement en mode Standard après l'envoi d'un message caché, éphémère, différé ou anonyme.",
                  autoResetMode,
                  setAutoResetMode
                )}

                <View>
                  <Text style={styles.label}>Durée éphémère par défaut (après lecture)</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[
                      { v: 5, l: "5 sec" },
                      { v: 10, l: "10 sec" },
                      { v: 30, l: "30 sec" },
                      { v: 60, l: "1 min" },
                      { v: 3600, l: "1 heure" },
                      { v: 86400, l: "24 heures" },
                    ].map((opt) => {
                      const active = defaultEphemeralTtl === opt.v;
                      return (
                        <TouchableOpacity
                          key={opt.v}
                          onPress={() => {
                            triggerHaptic();
                            setDefaultEphemeralTtl(opt.v);
                          }}
                          style={[styles.choiceChip, active && styles.choiceChipActive]}
                        >
                          <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{opt.l}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}

            {activeTab === "privacy" && (
              <>
                {renderSwitchRow(
                  "Afficher mon statut en ligne",
                  "Permet aux autres membres de voir lorsque vous êtes actif.",
                  showOnlineStatus,
                  setShowOnlineStatus
                )}

                {renderSwitchRow(
                  "Confirmations de lecture",
                  "Informe vos interlocuteurs lorsque leurs messages sont lus.",
                  readReceiptsEnabled,
                  setReadReceiptsEnabled
                )}

                {renderSwitchRow(
                  "Autoriser les nouvelles invitations privées",
                  "Si désactivé, aucune nouvelle demande de discussion privée ne pourra vous être envoyée.",
                  allowDmRequests,
                  setAllowDmRequests
                )}

                <View style={{ paddingTop: 8, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 10 }}>
                  <Text style={{ color: "#C5A03B", fontWeight: "700", fontSize: 14 }}>Changer de mot de passe</Text>
                  <TextInput
                    style={styles.input}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Mot de passe actuel"
                    placeholderTextColor="#64748B"
                    secureTextEntry
                  />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Nouveau mot de passe (min. 6 caractères)"
                    placeholderTextColor="#64748B"
                    secureTextEntry
                  />
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirmer le nouveau mot de passe"
                    placeholderTextColor="#64748B"
                    secureTextEntry
                  />
                </View>
              </>
            )}

            {activeTab === "appearance" && (
              <>
                <View>
                  <Text style={styles.label}>Taille du texte des messages</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {[
                      { k: "compact", l: "Compact" },
                      { k: "normal", l: "Standard" },
                      { k: "large", l: "Grand" },
                    ].map((opt) => {
                      const active = fontSize === opt.k;
                      return (
                        <TouchableOpacity
                          key={opt.k}
                          onPress={() => {
                            triggerHaptic();
                            setFontSize(opt.k);
                          }}
                          style={[styles.choiceChip, { flex: 1, alignItems: "center" }, active && styles.choiceChipActive]}
                        >
                          <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{opt.l}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={{ marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: "#2E5B88", alignSelf: "flex-end" }}>
                    <Text style={{ color: "#FFF", fontSize: fontSize === "compact" ? 13 : fontSize === "large" ? 17 : 15 }}>
                      Aperçu de la taille de lecture sur HomiChat.
                    </Text>
                  </View>
                </View>

                {renderSwitchRow(
                  "Retours haptiques (Vibrations douces)",
                  "Active un léger retour tactile lors des interactions.",
                  hapticsEnabled,
                  setHapticsEnabled
                )}

                {renderSwitchRow(
                  "Aperçus enrichis des liens",
                  "Affiche automatiquement une carte d'aperçu sous les liens web partagés.",
                  linkPreviewsEnabled,
                  setLinkPreviewsEnabled
                )}
              </>
            )}

            {activeTab === "account" && (
              <>
                <TouchableOpacity
                  onPress={() => {
                    clearChatMemoryCache();
                    Alert.alert("Cache vidé", "Le cache local des conversations a été nettoyé.");
                  }}
                  style={styles.actionRowBtn}
                >
                  <Feather name="refresh-cw" size={17} color="#C5A03B" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 14 }}>Vider le cache local</Text>
                    <Text style={{ color: "#94A3B8", fontSize: 12 }}>Force le rechargement complet des discussions depuis le serveur.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity onPress={onLogout} style={styles.actionRowBtn}>
                  <Feather name="log-out" size={17} color="#E2E8F0" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 14 }}>Se déconnecter</Text>
                    <Text style={{ color: "#94A3B8", fontSize: 12 }}>Fermer votre session active sur cet appareil.</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.dangerZone}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Feather name="alert-triangle" size={16} color="#f87171" />
                    <Text style={{ color: "#f87171", fontWeight: "700", fontSize: 14 }}>Zone sensible</Text>
                  </View>
                  <Text style={{ color: "#94A3B8", fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                    La suppression de votre compte efface définitivement votre profil, vos messages et vos publications.
                  </Text>

                  {!showDeleteConfirm ? (
                    <TouchableOpacity onPress={() => setShowDeleteConfirm(true)} style={styles.dangerBtn}>
                      <Feather name="trash-2" size={15} color="#f87171" />
                      <Text style={{ color: "#f87171", fontWeight: "700", fontSize: 13 }}>Supprimer mon compte</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ gap: 10 }}>
                      <Text style={{ color: "#f87171", fontSize: 12 }}>
                        Tapez SUPPRIMER ci-dessous pour confirmer définitivement :
                      </Text>
                      <TextInput
                        style={[styles.input, { borderColor: "rgba(248,113,113,0.5)" }]}
                        value={deleteConfirmText}
                        onChangeText={setDeleteConfirmText}
                        placeholder="SUPPRIMER"
                        placeholderTextColor="#64748B"
                        autoCapitalize="characters"
                      />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setShowDeleteConfirm(false);
                            setDeleteConfirmText("");
                          }}
                          style={[styles.smallOutlineBtn, { flex: 1, justifyContent: "center", paddingVertical: 10 }]}
                        >
                          <Text style={{ color: "#FFF", fontSize: 13 }}>Annuler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleDeleteAccount}
                          disabled={deleteConfirmText !== "SUPPRIMER"}
                          style={[
                            styles.dangerBtn,
                            { flex: 1, opacity: deleteConfirmText === "SUPPRIMER" ? 1 : 0.4 },
                          ]}
                        >
                          <Text style={{ color: "#f87171", fontWeight: "700", fontSize: 13 }}>Confirmer</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </>
            )}
          </ScrollView>

          {/* Footer Save Bar */}
          {activeTab !== "account" && (
            <View style={styles.footer}>
              <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                <Text style={{ color: "#E2E8F0", fontWeight: "600" }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
                {saving ? (
                  <ActivityIndicator size="small" color="#0A1128" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="#0A1128" />
                    <Text style={{ color: "#0A1128", fontWeight: "700", fontSize: 14 }}>Enregistrer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(5, 9, 22, 0.8)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0E1834",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: "90%",
    borderTopWidth: 1,
    borderColor: "rgba(197, 160, 59, 0.3)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: { color: "#C5A03B", fontSize: 19, fontWeight: "700" },
  closeBtn: { padding: 4 },
  tabsBar: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabPillActive: { backgroundColor: "#C5A03B", borderColor: "#C5A03B" },
  tabPillText: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  tabPillTextActive: { color: "#0A1128", fontWeight: "700" },
  body: { maxHeight: 480 },
  avatarCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  avatarImg: { width: 74, height: 74, borderRadius: 37, borderWidth: 2, borderColor: "#C5A03B" },
  avatarLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 37,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#C5A03B",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0E1834",
  },
  smallOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(197, 160, 59, 0.45)",
    backgroundColor: "rgba(197, 160, 59, 0.08)",
  },
  smallOutlineText: { color: "#C5A03B", fontSize: 12, fontWeight: "600" },
  label: { color: "#94A3B8", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(0,0,0,0.28)",
    color: "#FFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    fontSize: 14,
  },
  infoBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowTitle: { color: "#FFF", fontSize: 14, fontWeight: "600", marginBottom: 3 },
  rowSub: { color: "#94A3B8", fontSize: 12, lineHeight: 17 },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  choiceChipActive: { borderColor: "#C5A03B", backgroundColor: "rgba(197, 160, 59, 0.2)" },
  choiceChipText: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  choiceChipTextActive: { color: "#C5A03B" },
  actionRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  dangerZone: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.45)",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    flex: 1.5,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#C5A03B",
    alignItems: "center",
    justifyContent: "center",
  },
});
