import { useState, useEffect } from 'react';
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
  StatusBar
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAuthData, setAuthData, BASE_URL } from '../lib/api';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    getAuthData().then(auth => {
      if (auth?.token) {
        router.replace('/chat');
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleSubmit = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      let res, data;
      
      if (isLogin) {
        if (!identifier || !password) { setSubmitting(false); return; }
        res = await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password })
        });
        data = await res.json();
      } else {
        if (!username || !email || !password || !fullName) { setSubmitting(false); return; }
        if (password.length < 6) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
          setSubmitting(false);
          return;
        }
        res = await fetch(`${BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username, email, full_name: fullName, password,
            avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`
          })
        });
        data = await res.json();
      }

      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await setAuthData({ token: data.token, user: data.user });
        router.replace('/chat');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Erreur', data.detail || 'Authentification échouée');
      }
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur Réseau', e.message || 'Impossible de joindre le serveur');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#C5A03B" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#0A1128' }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0A1128" />
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.glassContainer}>
          
          {/* Logo image & App title */}
          <View style={styles.logoWrapper}>
            <Image 
              source={require('../assets/images/icon.png')}
              style={styles.logo} 
              resizeMode="contain"
            />
            <Text style={styles.title}>IQChat</Text>
            <Text style={styles.subtitle}>Royaume de Messagerie Sécurisée</Text>
          </View>
          
          {/* Custom Royal Tabs */}
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

          {/* Form fields */}
          {isLogin ? (
            <View style={styles.formContainer}>
              <TextInput 
                style={styles.input} 
                placeholder="Email ou Nom d'utilisateur" 
                placeholderTextColor="#8E9CB2" 
                value={identifier} 
                onChangeText={setIdentifier} 
                autoCapitalize="none" 
              />
              <View style={styles.passwordWrapper}>
                <TextInput 
                  style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                  placeholder="Mot de passe" 
                  placeholderTextColor="#8E9CB2" 
                  value={password} 
                  onChangeText={setPassword} 
                  secureTextEntry={!showPassword} 
                />
                <TouchableOpacity 
                  onPress={() => setShowPassword(!showPassword)} 
                  style={styles.eyeBtn}
                >
                  <Feather 
                    name={showPassword ? "eye" : "eye-off"} 
                    size={20} 
                    color="#8E9CB2" 
                  />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.formContainer}>
              <TextInput 
                style={styles.input} 
                placeholder="Nom Complet" 
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
                placeholder="Email" 
                placeholderTextColor="#8E9CB2" 
                value={email} 
                onChangeText={setEmail} 
                autoCapitalize="none" 
                keyboardType="email-address"
              />
              <View style={styles.passwordWrapper}>
                <TextInput 
                  style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                  placeholder="Mot de passe (min. 6 caractères)" 
                  placeholderTextColor="#8E9CB2" 
                  value={password} 
                  onChangeText={setPassword} 
                  secureTextEntry={!showPassword} 
                />
                <TouchableOpacity 
                  onPress={() => setShowPassword(!showPassword)} 
                  style={styles.eyeBtn}
                >
                  <Feather 
                    name={showPassword ? "eye" : "eye-off"} 
                    size={20} 
                    color="#8E9CB2" 
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Submit Button */}
          <TouchableOpacity 
            style={[styles.button, submitting && { opacity: 0.6 }]} 
            onPress={handleSubmit} 
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#1A1A1A" />
            ) : (
              <Text style={styles.buttonText}>{isLogin ? 'Entrer dans le Royaume' : 'Créer un Compte Royal'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0A1128' 
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  glassContainer: { 
    width: '100%', 
    padding: 28, 
    backgroundColor: 'rgba(255,255,255,0.03)', 
    borderRadius: 28, 
    borderWidth: 1, 
    borderColor: 'rgba(197, 160, 59, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 90,
    height: 90,
    borderRadius: 22,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(197, 160, 59, 0.3)',
  },
  title: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: '#C5A03B', 
    textAlign: 'center', 
    letterSpacing: 1.5,
  },
  subtitle: { 
    color: '#8E9CB2', 
    textAlign: 'center', 
    marginTop: 6,
    fontSize: 14,
  },
  toggleRow: { 
    flexDirection: 'row', 
    marginBottom: 24, 
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 6,
    borderRadius: 16,
  },
  toggleBtn: { 
    flex: 1, 
    padding: 12, 
    borderRadius: 12, 
    alignItems: 'center',
  },
  activeToggle: { 
    backgroundColor: '#C5A03B', 
  },
  toggleText: { 
    color: '#8E9CB2', 
    fontWeight: '600',
    fontSize: 15,
  },
  activeToggleText: {
    color: '#1A1A1A',
  },
  formContainer: {
    width: '100%',
    marginBottom: 8,
  },
  input: { 
    backgroundColor: 'rgba(0,0,0,0.25)', 
    borderRadius: 14, 
    padding: 16, 
    color: '#FFF', 
    marginBottom: 18, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.08)',
    fontSize: 15,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)', 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
    paddingRight: 16,
  },
  eyeBtn: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: { 
    backgroundColor: '#C5A03B', 
    padding: 18, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginTop: 10,
    shadowColor: '#C5A03B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonText: { 
    color: '#1A1A1A', 
    fontWeight: '700', 
    fontSize: 16,
  }
});
