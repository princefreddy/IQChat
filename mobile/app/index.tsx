import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { getAuthData, setAuthData, BASE_URL, fetchWithRetry } from "../lib/api";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    getAuthData().then((auth) => {
      if (auth?.token) {
        router.replace("/chat");
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleSubmit = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    setWakingUp(false);

    const wakingTimer = setTimeout(() => {
      setWakingUp(true);
    }, 4000);

    try {
      let res: Response;
      let data: any;

      if (isLogin) {
        if (!identifier.trim() || !password) {
          clearTimeout(wakingTimer);
          setSubmitting(false);
          return;
        }
        res = await fetchWithRetry(`${BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: identifier.trim(), password }),
          timeout: 30000,
          retries: 4,
          delay: 2000,
        });
        data = await res.json();
      } else {
        const cleanUsername = username.trim();
        const cleanEmail = email.trim();
        const cleanFullName = fullName.trim();
        if (!cleanUsername || !cleanEmail || !password || !cleanFullName) {
          clearTimeout(wakingTimer);
          Alert.alert("Champs requis", "Veuillez remplir tous les champs.");
          setSubmitting(false);
          return;
        }
        if (password.length < 6) {
          clearTimeout(wakingTimer);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Mot de passe trop court", "Le mot de passe doit contenir au moins 6 caractères.");
          setSubmitting(false);
          return;
        }
        res = await fetchWithRetry(`${BASE_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: cleanUsername,
            email: cleanEmail,
            full_name: cleanFullName,
            password,
            avatar_url: `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(cleanUsername)}`,
          }),
          timeout: 30000,
          retries: 4,
          delay: 2000,
        });
        data = await res.json();
      }

      clearTimeout(wakingTimer);
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await setAuthData({ token: data.token, user: data.user });
        router.replace("/chat");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Erreur", data.detail || "Authentification échouée");
      }
    } catch {
      clearTimeout(wakingTimer);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Connexion impossible", "Impossible de joindre le serveur. Vérifiez votre connexion internet et réessayez.");
    }
    setSubmitting(false);
    setWakingUp(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#C5A03B" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0A1128" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0A1128" />
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.glassContainer}>
          <View style={styles.logoWrapper}>
            <Image source={require("../assets/images/icon.png")} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>IQChat</Text>
            <Text style={styles.subtitle}>Messagerie calme, privée et maîtrisée</Text>
          </View>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsLogin(true);
                setShowPassword(false);
              }}
              style={[styles.toggleBtn, isLogin && styles.activeToggle]}
            >
              <Text style={[styles.toggleText, isLogin && styles.activeToggleText]}>Connexion</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsLogin(false);
                setShowPassword(false);
              }}
              style={[styles.toggleBtn, !isLogin && styles.activeToggle]}
            >
              <Text style={[styles.toggleText, !isLogin && styles.activeToggleText]}>Inscription</Text>
            </TouchableOpacity>
          </View>

          {isLogin ? (
            <View style={styles.formContainer}>
              <TextInput
                style={styles.input}
                placeholder="Email ou nom d'utilisateur"
                placeholderTextColor="#8E9CB2"
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
              />
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: "transparent" }]}
                  placeholder="Mot de passe"
                  placeholderTextColor="#8E9CB2"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#8E9CB2" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.formContainer}>
              <TextInput
                style={styles.input}
                placeholder="Nom complet"
                placeholderTextColor="#8E9CB2"
                value={fullName}
                onChangeText={setFullName}
              />
              <TextInput
                style={styles.input}
                placeholder="Nom d'utilisateur"
                placeholderTextColor="#8E9CB2"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Adresse email"
                placeholderTextColor="#8E9CB2"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: "transparent" }]}
                  placeholder="Mot de passe (min. 6 caractères)"
                  placeholderTextColor="#8E9CB2"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#8E9CB2" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity style={[styles.button, submitting && { opacity: 0.65 }]} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator size="small" color="#0A1128" />
                <Text style={[styles.buttonText, { color: "#0A1128" }]}>Connexion en cours...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>{isLogin ? "Se connecter" : "Créer mon compte"}</Text>
            )}
          </TouchableOpacity>

          {wakingUp && (
            <View
              style={{
                marginTop: 16,
                padding: 12,
                backgroundColor: "rgba(197, 160, 59, 0.08)",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(197, 160, 59, 0.25)",
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Feather name="clock" size={16} color="#C5A03B" />
              <Text style={{ color: "#C5A03B", fontSize: 13, flex: 1, lineHeight: 18 }}>
                Réveil du serveur distant en cours, merci de patienter quelques secondes...
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A1128" },
  scrollContainer: { flexGrow: 1, justifyContent: "center", padding: 24 },
  glassContainer: {
    width: "100%",
    padding: 26,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(197, 160, 59, 0.18)",
  },
  logoWrapper: { alignItems: "center", marginBottom: 24 },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: "rgba(197, 160, 59, 0.3)",
  },
  title: { fontSize: 30, fontWeight: "700", color: "#C5A03B", textAlign: "center", letterSpacing: 1 },
  subtitle: { color: "#8E9CB2", textAlign: "center", marginTop: 4, fontSize: 13 },
  toggleRow: {
    flexDirection: "row",
    marginBottom: 22,
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.22)",
    padding: 5,
    borderRadius: 14,
  },
  toggleBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  activeToggle: { backgroundColor: "#C5A03B" },
  toggleText: { color: "#8E9CB2", fontWeight: "600", fontSize: 14 },
  activeToggleText: { color: "#0A1128", fontWeight: "700" },
  formContainer: { width: "100%", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#FFF",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    fontSize: 15,
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 14,
    paddingRight: 12,
  },
  eyeBtn: { padding: 8, justifyContent: "center", alignItems: "center" },
  button: {
    backgroundColor: "#C5A03B",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#0A1128", fontWeight: "700", fontSize: 15 },
});
