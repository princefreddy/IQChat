import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, RefreshControl, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import PublicationsFeed from '../../components/PublicationsFeed';
import { getAuthData, setAuthData, clearAuthData, apiFetch, uploadFile, BASE_URL } from '../../lib/api';
import { ChatSkeleton } from '../../components/SkeletonLoader';

export default function ChatListScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  
  const [chats, setChats] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'chats' | 'directory' | 'feed'>('chats');
  
  const [newChatName, setNewChatName] = useState('');
  const [dirSearch, setDirSearch] = useState('');

  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasNewFeed, setHasNewFeed] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fetchChats = async (usr: any) => {
    try {
      const res = await fetch(`${BASE_URL}/chats/?user_id=${usr.id}`);
      if (res.ok) setChats(await res.json());
    } catch(e) { console.error(e); }
  };

  const fetchDirectory = async () => {
    try {
      const res = await fetch(`${BASE_URL}/users/`);
      if (res.ok) setDirectory(await res.json());
    } catch(e) {}
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getAuthData().then(auth => {
        if (!auth?.token) {
          router.replace('/');
        } else {
          setUser(auth.user);
          setToken(auth.token);
          Promise.all([fetchChats(auth.user), fetchDirectory()]).then(() => {
            setLoading(false);
          });
        }
      });
      
      const checkFeed = async () => {
        try {
          const res = await fetch(`${BASE_URL}/publications/latest_time`);
          const data = await res.json();
          if (data.latest_time) {
            const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
            const serverDateStr = data.latest_time.endsWith('Z') ? data.latest_time : data.latest_time + 'Z';
            const lastSeen = await AsyncStorage.getItem('iqchat_last_seen_feed');
            if (!lastSeen || new Date(serverDateStr).getTime() > new Date(lastSeen).getTime()) {
               if (viewMode !== 'feed') setHasNewFeed(true);
            }
          }
        } catch(e) {}
      };
      checkFeed();
      const interval = setInterval(() => {
        checkFeed();
        getAuthData().then(auth => {
          if (auth?.user) {
            fetchChats(auth.user);
            fetchDirectory();
          }
        });
      }, 15000);
      return () => clearInterval(interval);
    }, [viewMode])
  );

  const onRefresh = useCallback(() => {
    if (!user) return;
    setRefreshing(true);
    fetchChats(user).then(() => fetchDirectory()).finally(() => setRefreshing(false));
  }, [user]);

  const handleCreateChat = async (targetUser: string, chatName?: string, isGroup: boolean = false) => {
    if (!isGroup && !targetUser) return;
    if (isGroup && !chatName) return;
    try {
      const res = await fetch(`${BASE_URL}/chats/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: isGroup ? 'group' : 'private', name: chatName || targetUser, member_usernames: isGroup ? [user.username] : [user.username, targetUser] })
      });
      if (res.ok) {
        const createdChat = await res.json();
        if (createdChat && createdChat.id) {
          setViewMode('chats');
          fetchChats(user);
          router.push(`/chat/${createdChat.id}`);
        }
      } else {
        Alert.alert("Erreur", "Impossible d'initier la discussion.");
      }
    } catch(e) { console.error(e); }
  };

  const handleToggleBan = async (userId: string, currentBanState: boolean) => {
    Alert.alert(
      "Confirmation",
      currentBanState ? 'Débannir cet utilisateur ?' : 'Bannir cet utilisateur ?',
      [
        { text: "Annuler", style: "cancel" },
        { 
          text: "Confirmer", 
          onPress: async () => {
            try {
              const res = await apiFetch(`/users/${userId}/ban`, { method: 'PUT' });
              if (res.ok) fetchDirectory();
            } catch (e) {}
          }
        }
      ]
    );
  };

  const handleLogout = async () => {
    await clearAuthData();
    router.replace('/');
  };

  const handleSaveSettings = async () => {
    try {
      const updates: any = {};
      if (editName) updates.full_name = editName;
      if (editAvatar) updates.avatar_url = editAvatar;
      if (editPassword) {
        if (editPassword.length < 6) {
          Alert.alert("Erreur", "Le mot de passe doit contenir au moins 6 caractères");
          return;
        }
        updates.password = editPassword;
      }

      const res = await apiFetch('/users/me', {
         method: 'PUT',
         body: JSON.stringify(updates)
      });
      if (res.ok) {
         const data = await res.json();
         setUser(data);
         await setAuthData({ token, user: data });
         setShowSettings(false);
      } else {
         Alert.alert("Erreur", "Mise à jour échouée.");
      }
    } catch(err) { console.error(err); }
  };

  const formatDate = (dateString: string) => {
     const d = new Date(dateString);
     return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const renderChatItem = ({ item }: any) => {
    const isPrivate = item.type === 'private';
    const otherMember = isPrivate ? item.members?.find((m: any) => m.user_id !== user.id) : null;
    const otherUserFromDir = otherMember ? directory.find((u: any) => u.id === otherMember.user_id) : null;

    return (
      <TouchableOpacity style={styles.chatItem} onPress={() => router.push(`/chat/${item.id}`)}>
        <View style={styles.chatAvatar}>
           {isPrivate && otherUserFromDir ? (
             <View style={{ position: 'relative' }}>
               <Image source={{ uri: otherUserFromDir.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
               {otherUserFromDir.is_online && <View style={styles.onlineDotChatItem} />}
             </View>
           ) : (
             <Text style={styles.avatarText}>{isPrivate && otherUserFromDir ? (otherUserFromDir.full_name || otherUserFromDir.username).charAt(0).toUpperCase() : (item.name ? item.name.charAt(0).toUpperCase() : 'G')}</Text>
           )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName}>
             {isPrivate && otherUserFromDir ? (otherUserFromDir.full_name || otherUserFromDir.username) : (item.name || 'Group Chat')}
          </Text>
          <Text style={styles.chatType}>{item.type} chat</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {item.status === 'pending' ? (
             <Text style={{ fontSize: 10, color: '#C5A03B' }}>
               {item.members?.find((m: any) => m.user_id === user.id)?.role === 'admin' ? '⏳ Envoi...' : '⏳ Invitation'}
             </Text>
          ) : (
             <>
               <Text style={{ fontSize: 12, color: '#888' }}>{formatDate(item.last_message_at || item.created_at)}</Text>
               {item.unread_count > 0 && (
                  <View style={{ backgroundColor: '#4ade80', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ color: '#000', fontSize: 10, fontWeight: 'bold' }}>{item.unread_count}</Text>
                  </View>
               )}
             </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderDirItem = ({ item }: any) => {
    if (item.id === user.id) return null;
    if (item.is_banned && user.username !== 'admin') return null;

    return (
      <TouchableOpacity style={[styles.chatItem, { opacity: item.is_banned ? 0.5 : 1 }]} onPress={() => handleCreateChat(item.username, item.full_name)} disabled={item.is_banned && user.username !== 'admin'}>
        <View style={{ position: 'relative' }}>
           <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
           {item.is_online && <View style={styles.onlineDot} />}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.chatName, item.is_banned && { textDecorationLine: 'line-through' }]}>{item.full_name}</Text>
          <Text style={styles.chatType}>@{item.username} {item.is_banned && <Text style={{color: '#ff4d4f', fontWeight: 'bold'}}>[Banni]</Text>}</Text>
        </View>
        {user.username === 'admin' && item.username !== 'admin' && (
           <TouchableOpacity 
             style={{ padding: 6, borderRadius: 8, borderWidth: 1, borderColor: item.is_banned ? '#4ade80' : '#ff4d4f', backgroundColor: item.is_banned ? '#111D36' : 'rgba(255, 77, 79, 0.1)' }}
             onPress={() => handleToggleBan(item.id, item.is_banned)}
           >
              <Text style={{ color: item.is_banned ? '#4ade80' : '#ff4d4f', fontWeight: 'bold', fontSize: 12 }}>
                {item.is_banned ? '♻️ Débannir' : '🛑 Bannir'}
              </Text>
           </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (!user) return null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      
      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowSettings(false)} activeOpacity={1} />
          <View style={[styles.modalContainer, { paddingBottom: 40 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={styles.modalTitle}>Profil</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                 <Text style={{ color: '#888', fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <TouchableOpacity
                onPress={async () => {
                  if (uploadingAvatar) return;
                  let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
                  if (!result.canceled && result.assets[0].uri) {
                     setUploadingAvatar(true);
                     try {
                        const asset = result.assets[0];
                        const fileName = asset.fileName || `avatar_${Date.now()}.jpg`;
                        const uploaded = await uploadFile(asset.uri, fileName, 'image/jpeg');
                        setEditAvatar(uploaded.url);
                     } catch (err: any) {
                        Alert.alert("Erreur", err.message || "Impossible de téléverser la photo de profil");
                     } finally {
                        setUploadingAvatar(false);
                     }
                  }
                }}
                style={{ position: 'relative' }}
                disabled={uploadingAvatar}
              >
                {editAvatar ? (
                  <Image source={{ uri: editAvatar }} style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#C5A03B' }} />
                ) : (
                  <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' }}>
                    <Text style={{ fontSize: 40 }}>📸</Text>
                  </View>
                )}
                {uploadingAvatar && (
                  <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 50, justifyContent: 'center', alignItems: 'center' }}>
                     <ActivityIndicator size="small" color="#C5A03B" />
                  </View>
                )}
                <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: '#C5A03B', borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#111D36' }}><Text style={{ fontSize: 14 }}>✏️</Text></View>
              </TouchableOpacity>
            </View>

            <Text style={{ color: '#888', marginBottom: 6, marginLeft: 4 }}>Nom complet</Text>
            <TextInput style={[styles.modalInput, { marginBottom: 16 }]} value={editName} onChangeText={setEditName} placeholder="Maxime D." placeholderTextColor="#555" />

            <Text style={{ color: '#888', marginBottom: 6, marginLeft: 4 }}>Nouveau mot de passe</Text>
            <TextInput style={[styles.modalInput, { marginBottom: 24 }]} value={editPassword} onChangeText={setEditPassword} placeholder="Laisser vide pour ne pas modifier" placeholderTextColor="#555" secureTextEntry />

            <TouchableOpacity style={[styles.createBtn, { width: '100%' }]} onPress={handleSaveSettings}>
              <Text style={{ color: '#000', textAlign: 'center', fontWeight: 'bold' }}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        <TouchableOpacity style={[styles.toggleBtn, viewMode === 'chats' && styles.activeToggle]} onPress={() => setViewMode('chats')}>
           <Text style={[styles.toggleText, viewMode === 'chats' && { color: '#000' }]}>DM</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, viewMode === 'directory' && styles.activeToggle]} onPress={() => setViewMode('directory')}>
           <Text style={[styles.toggleText, viewMode === 'directory' && { color: '#000' }]}>Annuaire</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, viewMode === 'feed' && styles.activeToggle, {position: 'relative'}]} onPress={async () => { setViewMode('feed'); setHasNewFeed(false); const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage'); AsyncStorage.setItem('iqchat_last_seen_feed', new Date().toISOString()); }}>
           <Text style={[styles.toggleText, viewMode === 'feed' && { color: '#000' }]}>Feed</Text>
           {hasNewFeed && <View style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, backgroundColor: '#ff4d4f', borderRadius: 4 }} />}
        </TouchableOpacity>
      </View>

      {viewMode === 'chats' && (
        <View style={styles.createBox}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={styles.input} placeholder="Nouveau Groupe (nom)" placeholderTextColor="#888" value={newChatName} onChangeText={setNewChatName} />
            <TouchableOpacity style={styles.createBtn} onPress={() => handleCreateChat('', newChatName, true)} disabled={!newChatName}>
               <Text style={styles.createBtnText}>Grp</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {viewMode === 'directory' && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#333' }}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <TextInput
              placeholder="Rechercher un utilisateur..."
              placeholderTextColor="#888"
              value={dirSearch}
              onChangeText={setDirSearch}
              autoCapitalize="none"
              style={{ flex: 1, marginLeft: 12, color: '#FFF' }}
            />
            {dirSearch.length > 0 && (
              <TouchableOpacity onPress={() => setDirSearch('')}>
                <Text style={{ color: '#888', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {viewMode === 'feed' ? (
         <PublicationsFeed user={user} />
      ) : loading ? (
         <ChatSkeleton />
      ) : (
         <FlatList 
           data={viewMode === 'chats' ? chats : directory.filter(u => {
             if (!dirSearch) return true;
             const q = dirSearch.toLowerCase();
             return (u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q));
           })}
           keyExtractor={item => item.id}
           renderItem={viewMode === 'chats' ? renderChatItem : renderDirItem}
           contentContainerStyle={{ paddingBottom: 100 }}
           refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C5A03B" />}
           ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 20 }}>Rien à afficher.</Text>}
         />
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.userInfo} onPress={() => {
           setEditName(user.full_name || user.username);
           setEditAvatar(user.avatar_url || '');
           setEditPassword('');
           setShowSettings(true);
        }}>
          {user.avatar_url && <Image source={{ uri: user.avatar_url }} style={styles.userAvatar} />}
          <View>
            <Text style={styles.userName}>{user.full_name || user.username}</Text>
            <Text style={styles.userStatus}>⚙️ Modifier le profil</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout}><Text style={{ fontSize: 24 }}>🚪</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1128' },
  toggleBtn: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  activeToggle: { backgroundColor: '#C5A03B', borderColor: '#C5A03B' },
  toggleText: { color: '#FFF', fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: '#111D36', padding: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderBottomWidth: 0, borderColor: '#333' },
  modalTitle: { color: '#C5A03B', fontSize: 24, fontWeight: 'bold', marginBottom: 0 },
  createBox: { padding: 16, borderBottomWidth: 1, borderColor: '#222' },
  input: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', color: '#FFF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  modalInput: { backgroundColor: 'rgba(0,0,0,0.3)', color: '#FFF', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  createBtn: { height: 48, backgroundColor: '#C5A03B', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  createBtnText: { fontSize: 16, fontWeight: 'bold' },
  chatItem: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center', gap: 12 },
  chatAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(212,175,55,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#C5A03B', fontSize: 20, fontWeight: 'bold' },
  chatName: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  chatType: { color: '#888', fontSize: 12 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, backgroundColor: '#4ade80', borderRadius: 7, borderWidth: 2, borderColor: '#0A1128' },
  onlineDotChatItem: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, backgroundColor: '#4ade80', borderRadius: 6, borderWidth: 2, borderColor: '#0A1128' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#111D36', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#333' },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF' },
  userName: { color: '#FFF', fontWeight: 'bold' },
  userStatus: { color: '#C5A03B', fontSize: 12 }
});
