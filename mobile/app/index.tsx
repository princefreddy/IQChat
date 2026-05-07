import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getAuthData, setAuthData, BASE_URL } from '../lib/api';

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
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
        // Store JWT token + user data
        await setAuthData({ token: data.token, user: data.user });
        router.replace('/chat');
      } else {
        Alert.alert('Erreur', data.detail || 'Authentification échouée');
      }
    } catch (e: any) {
      Alert.alert('Erreur Réseau', e.message || 'Impossible de joindre le serveur');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.glassContainer}>
        <Text style={styles.title}>IQChat V2</Text>
        <Text style={styles.subtitle}>Secure Royal Realm</Text>
        
        <View style={styles.toggleRow}>
           <TouchableOpacity onPress={() => setIsLogin(true)} style={[styles.toggleBtn, isLogin && styles.activeToggle]}>
             <Text style={styles.toggleText}>Connexion</Text>
           </TouchableOpacity>
           <TouchableOpacity onPress={() => setIsLogin(false)} style={[styles.toggleBtn, !isLogin && styles.activeToggle]}>
             <Text style={styles.toggleText}>Inscription</Text>
           </TouchableOpacity>
        </View>

        {isLogin ? (
          <>
            <TextInput style={styles.input} placeholder="Email ou Nom d'utilisateur" placeholderTextColor="#888" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Mot de passe" placeholderTextColor="#888" value={password} onChangeText={setPassword} secureTextEntry />
          </>
        ) : (
          <>
            <TextInput style={styles.input} placeholder="Nom Complet" placeholderTextColor="#888" value={fullName} onChangeText={setFullName} />
            <TextInput style={styles.input} placeholder="Nom d'utilisateur" placeholderTextColor="#888" value={username} onChangeText={setUsername} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#888" value={email} onChangeText={setEmail} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Mot de passe (min. 6 caractères)" placeholderTextColor="#888" value={password} onChangeText={setPassword} secureTextEntry />
          </>
        )}
        
        <TouchableOpacity style={[styles.button, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.buttonText}>{isLogin ? 'Entrer' : 'Rejoindre'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0A10', justifyContent: 'center', alignItems: 'center', padding: 24 },
  glassContainer: { width: '100%', padding: 24, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  title: { fontSize: 40, fontWeight: 'bold', color: '#D4AF37', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#bbb', textAlign: 'center', marginBottom: 24 },
  toggleRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  toggleBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  activeToggle: { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.1)' },
  toggleText: { color: '#FFF', fontWeight: 'bold' },
  input: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, color: '#FFF', marginBottom: 16, borderWidth: 1, borderColor: '#333' },
  button: { backgroundColor: '#D4AF37', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 }
});
