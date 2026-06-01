import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, Linking, RefreshControl, Modal, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { apiFetch, BASE_URL } from '../lib/api';

const MAX_CHARS = 500;

export default function PublicationsFeed({ user }: any) {
  const [publications, setPublications] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shareConfig, setShareConfig] = useState<any>(null);
  const [myChats, setMyChats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPublications = async () => {
    try {
      const res = await apiFetch('/publications/');
      if (res.ok) setPublications(await res.json());
    } catch(err) {}
  };

  useFocusEffect(
    useCallback(() => {
      fetchPublications();
      const interval = setInterval(fetchPublications, 20000);
      return () => clearInterval(interval);
    }, [user])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPublications();
    setRefreshing(false);
  };

  const loadChatsForSharing = async () => {
    try {
       const res = await fetch(`${BASE_URL}/chats/?user_id=${user.id}`);
       if (res.ok) setMyChats(await res.json());
    } catch(err) {}
  };

  const executeShare = async (chatId: string) => {
    if (!shareConfig) return;
    const shareText = `[Partagé de @${shareConfig.author}]\n${shareConfig.content}`;
    try {
       await apiFetch('/messages/send', {
         method: 'POST',
         body: JSON.stringify({ chat_id: chatId, content: shareText })
       });
       setShareConfig(null);
    } catch(err) {}
  };

  const handleRepost = async (pub: any) => {
    const repostText = `[♻️ Repost de @${pub.author_username}]\n\n${pub.content}`;
    try {
      const res = await apiFetch('/publications/', {
        method: 'POST',
        body: JSON.stringify({ content: repostText, repost_of_id: pub.id })
      });
      if (res.ok) fetchPublications();
    } catch(err) {}
  };

  const getChatDisplayName = (c: any) => {
    if (c.type === 'group') return c.name;
    const other = c.members?.find((m: any) => m.user_id !== user.id);
    return other ? (other.full_name || other.username) : 'Discussion Privée';
  };

  const handleCopyText = async () => {
     if (!shareConfig) return;
     await Clipboard.setStringAsync(`[De @${shareConfig.author}]: ${shareConfig.content}`);
     Alert.alert("Copié !", "La publication a été copiée dans le presse-papier.");
     setShareConfig(null);
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    if (content.length > MAX_CHARS) {
      Alert.alert("Limite", `Maximum ${MAX_CHARS} caractères`);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/publications/', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim() })
      });
      if (res.ok) {
        setContent('');
        fetchPublications();
      } else {
        const err = await res.json();
        Alert.alert("Erreur", err.detail || "Erreur de publication");
      }
    } catch(err) {}
    setLoading(false);
  };

  const handleDeletePub = async (id: string) => {
    Alert.alert(
      "Supprimer",
      "Voulez-vous vraiment supprimer cette publication ?",
      [
        { text: "Annuler", style: "cancel" },
        { 
          text: "Supprimer", 
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiFetch(`/publications/${id}`, { method: 'DELETE' });
              if (res.ok) fetchPublications();
            } catch(err) {}
          }
        }
      ]
    );
  };

  const handleReact = async (id: string, isLike: boolean) => {
    try {
      await apiFetch(`/publications/${id}/react`, {
        method: 'POST',
        body: JSON.stringify({ is_like: isLike })
      });
      fetchPublications();
    } catch(err) {}
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const charsLeft = MAX_CHARS - content.length;
  const isOverLimit = charsLeft < 0;

  const renderItem = ({ item }: { item: any }) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = item.content.split(urlRegex);

    return (
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: item.is_pinned ? '#C5A03B' : 'rgba(255,255,255,0.1)', marginBottom: 16 }}>
        {item.is_pinned && (
           <View style={{ position: 'absolute', top: -10, left: 16, backgroundColor: '#0A1128', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' }}>
             <Text style={{ fontSize: 12, color: '#C5A03B', fontWeight: 'bold' }}>📌 Épinglé</Text>
           </View>
        )}
        {item.repost_of_id && (
           <View style={{ marginBottom: 4 }}>
             <Text style={{ fontSize: 12, color: '#888', fontWeight: 'bold' }}>🔁 Reposté</Text>
           </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: item.is_pinned ? 4 : 0 }}>
           {item.author_avatar ? (
             <Image source={{ uri: item.author_avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} />
           ) : (
             <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' }} />
           )}
           <View style={{ marginLeft: 12, flex: 1 }}>
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{item.author_full_name || item.author_username}</Text>
                {item.is_supreme_admin && <Text style={{ fontSize: 14 }}>☑️</Text>}
             </View>
             <Text style={{ color: '#888', fontSize: 12 }}>@{item.author_username} • {formatDate(item.created_at)}</Text>
           </View>
        </View>

        <Text style={{ color: '#FFF', fontSize: 15, lineHeight: 22 }}>
          {parts.map((part: string, i: number) => {
            if (part.match(/^https?:\/\//)) {
              return <Text key={i} style={{ color: '#C5A03B', textDecorationLine: 'underline' }} onPress={() => Linking.openURL(part)}>{part}</Text>;
            }
            return part;
          })}
        </Text>

        <View style={{ flexDirection: 'row', marginTop: 16, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.05)', paddingTop: 12, gap: 16, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => handleReact(item.id, true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16 }}>👍</Text>
            <Text style={{ color: item.user_reaction === true ? '#C5A03B' : '#888', fontWeight: 'bold' }}>{item.likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleReact(item.id, false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16 }}>👎</Text>
            <Text style={{ color: item.user_reaction === false ? '#ff4d4f' : '#888', fontWeight: 'bold' }}>{item.dislikes}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => handleRepost(item)} 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text style={{ fontSize: 16 }}>♻️</Text>
            <Text style={{ color: '#888', fontWeight: 'bold' }}>{item.reposts_count > 0 ? item.reposts_count : 'Repost'}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => { setShareConfig({ pubId: item.id, content: item.content, author: item.author_username }); loadChatsForSharing(); }} 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
          >
            <Text style={{ fontSize: 16 }}>📤</Text>
            <Text style={{ color: '#888', fontWeight: 'bold' }}>Partager</Text>
          </TouchableOpacity>
          {(user.username === 'admin' || user.id === item.author_id) && (
             <TouchableOpacity 
                onPress={() => handleDeletePub(item.id)} 
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 12 }}
             >
                <Text style={{ fontSize: 14 }}>🗑️</Text>
                <Text style={{ color: '#ff4d4f', fontWeight: 'bold' }}>Supp.</Text>
             </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
       <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#333' }}>
         <Text style={{ color: '#C5A03B', fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>🌍 Fil Public</Text>
         <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#333' }}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <TextInput 
              placeholder="Rechercher un auteur (pseudo ou nom)..." 
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{ flex: 1, marginLeft: 12, color: '#FFF' }}
            />
         </View>
       </View>

       <FlatList 
         data={publications.filter(p => !searchQuery || p.author_username.toLowerCase().includes(searchQuery.toLowerCase()) || (p.author_full_name && p.author_full_name.toLowerCase().includes(searchQuery.toLowerCase())))}
         keyExtractor={item => item.id}
         renderItem={renderItem}
         contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
         refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C5A03B" />}
         ListHeaderComponent={
            <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#333', marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Image source={{ uri: user?.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                <TextInput 
                  placeholder="Que voulez-vous partager ?"
                  placeholderTextColor="#888"
                  value={content}
                  onChangeText={setContent}
                  multiline
                  maxLength={MAX_CHARS + 50}
                  style={{ flex: 1, color: '#FFF', minHeight: 60, fontSize: 16, textAlignVertical: 'top' }}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ 
                  fontSize: 12, 
                  color: isOverLimit ? '#ff4d4f' : charsLeft < 50 ? '#fbbf24' : '#888',
                  fontWeight: isOverLimit ? 'bold' : 'normal',
                }}>
                  {charsLeft} caractères restants
                </Text>
                <TouchableOpacity onPress={handlePost} disabled={loading || !content.trim() || isOverLimit} style={{ backgroundColor: '#2E5B88', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, opacity: (content.trim() && !isOverLimit) ? 1 : 0.5 }}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{loading ? '⏳...' : 'Publier'}</Text>
                </TouchableOpacity>
              </View>
            </View>
         }
         ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Aucune publication pour le moment.</Text>}
       />

       {/* Share Modal */}
       <Modal visible={!!shareConfig} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
             <View style={{ width: '100%', backgroundColor: '#111D36', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#333' }}>
                <Text style={{ color: '#C5A03B', fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Partager vers...</Text>
                
                <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
                  {myChats.map(c => (
                     <TouchableOpacity 
                    key={c.id} 
                    onPress={() => executeShare(c.id)}
                    style={{ padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' }}>
                       <Text style={{ fontSize: 20 }}>{c.type === 'group' ? '👥' : '👤'}</Text>
                    </View>
                    <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>{getChatDisplayName(c)}</Text>
                  </TouchableOpacity>
                ))}
                  {myChats.length === 0 && <Text style={{ color: '#888' }}>Aucune conversation disponible.</Text>}
                </ScrollView>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                   <TouchableOpacity onPress={handleCopyText} style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
                      <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Copier le texte</Text>
                   </TouchableOpacity>
                   <TouchableOpacity onPress={() => setShareConfig(null)} style={{ padding: 12 }}>
                      <Text style={{ color: '#888', fontWeight: 'bold' }}>Annuler</Text>
                   </TouchableOpacity>
                </View>
             </View>
          </View>
       </Modal>
    </View>
  );
}
