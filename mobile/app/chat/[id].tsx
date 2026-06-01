import { useState, useEffect, useRef, useCallback } from 'react';
import { View, FlatList, StyleSheet, Text, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, ScrollView, Alert, Animated } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import MessageBubble from '../../components/MessageBubble';
import MessageInput from '../../components/MessageInput';
import { getAuthData, apiFetch, getChatWsUrl, BASE_URL } from '../../lib/api';

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Typing indicator
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDots = useRef(new Animated.Value(0)).current;

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);

  // Typing dots animation
  useEffect(() => {
    if (typingUser) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(typingDots, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(typingDots, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [typingUser]);

  useEffect(() => {
    if (showAddMember && user) {
      apiFetch('/users/me/contacts').then(r => r.json()).then(setContacts).catch(console.log);
    }
  }, [showAddMember, user]);

  const handleAddMembers = async () => {
    if (selectedUsernames.length === 0) return;
    try {
      const res = await apiFetch(`/chats/${id}/add_members`, {
        method: 'POST',
        body: JSON.stringify({ member_usernames: selectedUsernames })
      });
      if (res.ok) {
         setShowAddMember(false);
         setSelectedUsernames([]);
         const cRes = await fetch(`${BASE_URL}/chats/${id}?user_id=${user.id}`);
         if (cRes.ok) setChatInfo(await cRes.json());
      }
    } catch (e) {}
  };

  const handleLeaveChat = () => {
    Alert.alert(
      isPrivate ? "Masquer la conversation" : "Quitter le groupe",
      isPrivate ? "Cette action masquera la conversation de votre liste." : "Vous ne ferez plus partie de ce groupe.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Valider", style: "destructive", onPress: async () => {
            await apiFetch(`/chats/${id}/leave`, { method: 'DELETE' });
            router.back();
        }}
      ]
    );
  };

  const handleDeleteChat = () => {
    Alert.alert("Détruire le groupe", "Attention, cette action est irréversible pour tous les membres !", [
      { text: "Annuler", style: "cancel" },
      { text: "Détruire", style: "destructive", onPress: async () => {
          await apiFetch(`/chats/${id}`, { method: 'DELETE' });
          router.back();
      }}
    ]);
  };

  const handleKickMember = (targetId: string, targetName: string) => {
    Alert.alert("Expulser", `Voulez-vous retirer ${targetName} du groupe ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Expulser", style: "destructive", onPress: async () => {
          const res = await apiFetch(`/chats/${id}/members/${targetId}`, { method: 'DELETE' });
          if (res.ok) {
             const cRes = await fetch(`${BASE_URL}/chats/${id}?user_id=${user.id}`);
             if (cRes.ok) setChatInfo(await cRes.json());
          }
      }}
    ]);
  };

  useEffect(() => {
    let ws: WebSocket;
    getAuthData().then(auth => {
      if (auth?.user) {
        const parsed = auth.user;
        setUser(parsed);
        
        fetch(`${BASE_URL}/chats/${id}?user_id=${parsed.id}`)
          .then(r => r.json())
          .then(data => {
            setChatInfo(data);
            setMessages(data.messages);
          });

        ws = new WebSocket(getChatWsUrl(id as string, parsed.id));
        wsRef.current = ws;
        
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          // Handle typed events
          if (data.event === 'typing') {
            if (data.is_typing) {
              setTypingUser(data.username);
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
            } else {
              setTypingUser(null);
            }
            return;
          }
          
          if (data.event === 'read') {
            setMessages(prev => prev.map(m => 
              m.sender_id === parsed.id ? { ...m, is_read: true } : m
            ));
            return;
          }
          
          // Regular message
          setMessages(prev => {
             const idx = prev.findIndex(m => m.id === data.id);
             if (idx !== -1) {
                const arr = [...prev];
                arr[idx] = data;
                return arr;
             }
             return [...prev, data];
          });
        };

        // Poll chat info every 30s to detect status changes (invite accepted, members updated, etc.)
        const chatPollInterval = setInterval(async () => {
          try {
            const res = await fetch(`${BASE_URL}/chats/${id}?user_id=${parsed.id}`);
            if (res.ok) {
              const data = await res.json();
              setChatInfo(data);
            }
          } catch {}
        }, 30000);

        return () => { 
          if(ws) ws.close(); 
          wsRef.current = null;
          clearInterval(chatPollInterval);
        };
      }
    });
  }, [id]);

  // Send typing event via WebSocket
  const sendTypingEvent = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && user) {
      wsRef.current.send(JSON.stringify({
        event: 'typing',
        username: user.username || user.full_name,
        is_typing: isTyping,
      }));
    }
  }, [user]);

  const handleSend = async (msgData: any) => {
    sendTypingEvent(false);
    try {
      await apiFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ chat_id: id, ...msgData })
      });
    } catch(e) {}
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    try {
      await apiFetch(`/messages/${msgId}/reaction`, {
        method: 'PUT',
        body: JSON.stringify({ emoji })
      });
    } catch(e) {}
  };

  const handleAccept = async () => {
    try {
      const res = await fetch(`${BASE_URL}/chats/${id}/accept?user_id=${user.id}`, { method: 'PATCH' });
      if (res.ok) {
        // Re-fetch full chat data so input bar appears instantly
        const chatRes = await fetch(`${BASE_URL}/chats/${id}?user_id=${user.id}`);
        if (chatRes.ok) {
          const data = await chatRes.json();
          setChatInfo(data);
          setMessages(data.messages);
        }
      }
    } catch(err) {}
  };

  const isPrivate = chatInfo?.type === 'private';
  const otherMember = isPrivate ? chatInfo?.members?.find((m: any) => m.user_id !== user?.id) : null;
  const amIAdmin = chatInfo?.members?.find((m: any) => m.user_id === user?.id)?.role === 'admin';
  const isPending = chatInfo?.status === 'pending';
  const onlineStatusText = isPrivate 
      ? (otherMember?.is_online ? '🟢 En ligne' : null)
      : `${chatInfo?.members?.length || 0} participants`;
  const headerTitle = isPrivate 
      ? (otherMember ? (otherMember.full_name || otherMember.username) : 'Chat') 
      : `${chatInfo?.name || 'Group Chat'} ${amIAdmin ? '👑' : ''}`;

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen 
        options={{ 
          title: headerTitle,
          headerStyle: { backgroundColor: '#111D36' },
          headerTintColor: '#C5A03B',
          headerTitle: () => (
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
               {(isPrivate && otherMember?.avatar_url) ? (
                 <TouchableOpacity onPress={() => setViewImage(otherMember.avatar_url)}>
                   <Image source={{ uri: otherMember.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                 </TouchableOpacity>
               ) : null}
               <View>
                 <Text style={{ color: '#C5A03B', fontSize: 18, fontWeight: 'bold' }}>{headerTitle}</Text>
                 <Text style={{ color: '#888', fontSize: 12 }}>{onlineStatusText}</Text>
               </View>
             </View>
          ),
          headerRight: () => (
             <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
               <TouchableOpacity onPress={handleLeaveChat} style={{ padding: 4 }}>
                 <Text style={{ fontSize: 16 }}>🚪</Text>
               </TouchableOpacity>
               {!isPrivate && amIAdmin && (
                 <TouchableOpacity onPress={handleDeleteChat} style={{ padding: 4 }}>
                   <Text style={{ fontSize: 16 }}>🗑️</Text>
                 </TouchableOpacity>
               )}
               {!isPrivate && amIAdmin && (
                 <TouchableOpacity onPress={() => setShowAddMember(true)} style={{ padding: 6, borderWidth: 1, borderColor: '#C5A03B', borderRadius: 8 }}>
                   <Text style={{ color: '#C5A03B', fontSize: 12 }}>+ Membres</Text>
                 </TouchableOpacity>
               )}
             </View>
          )
        }} 
      />
      <FlatList 
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <MessageBubble 
            message={item} 
            isOwn={item.sender_id === user.id} 
            currentUserId={user.id}
            onReaction={(msgId: string, emoji: string) => handleReaction(msgId, emoji)}
            onReply={() => setReplyingTo(item)}
          />
        )}
        contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={
          typingUser ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
              <Animated.View style={{ 
                flexDirection: 'row', gap: 4, padding: 10, 
                backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderBottomLeftRadius: 4,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                opacity: typingDots.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
              }}>
                <View style={[styles.dot, { animationDelay: '0ms' }]} />
                <View style={[styles.dot, { animationDelay: '150ms' }]} />
                <View style={[styles.dot, { animationDelay: '300ms' }]} />
              </Animated.View>
              <Text style={{ fontSize: 12, color: '#C5A03B', fontStyle: 'italic', opacity: 0.8 }}>
                {typingUser} écrit...
              </Text>
            </View>
          ) : null
        }
      />
      
      {showAddMember && (
        <Modal transparent animationType="slide" visible={showAddMember}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#111D36', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#333' }}>
              
              <Text style={{ color: '#C5A03B', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Membres Actuels</Text>
              <ScrollView style={{ maxHeight: 150, marginBottom: 16 }}>
                 {chatInfo?.members?.map((m: any) => (
                    <View key={m.user_id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 4 }}>
                       <Text style={{ color: '#FFF' }}>{m.username} {m.role === 'admin' ? '👑' : ''}</Text>
                       {!isPrivate && amIAdmin && m.user_id !== user.id && (
                          <TouchableOpacity onPress={() => handleKickMember(m.user_id, m.username)}>
                             <Text style={{ color: '#ef4444', fontSize: 12 }}>Retirer</Text>
                          </TouchableOpacity>
                       )}
                    </View>
                 ))}
              </ScrollView>

              <Text style={{ color: '#C5A03B', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Ajouter des contacts</Text>
              {contacts.length === 0 ? (
                 <Text style={{ color: '#888', marginBottom: 16 }}>Vous n'avez aucun contact... Échangez d'abord en privé !</Text>
              ) : (
                 <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
                   {contacts.map(c => {
                      if (chatInfo.members.some((m: any) => m.user_id === c.id)) return null;
                      const isSelected = selectedUsernames.includes(c.username);
                      return (
                         <TouchableOpacity
                           key={c.id}
                           onPress={() => setSelectedUsernames(prev => isSelected ? prev.filter(u => u !== c.username) : [...prev, c.username])}
                           style={{ padding: 12, borderRadius: 12, backgroundColor: isSelected ? 'rgba(212,175,55,0.2)' : 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: isSelected ? '#C5A03B' : '#333', flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
                         >
                           <Text style={{ color: '#FFF', fontSize: 16 }}>{c.full_name || c.username}</Text>
                         </TouchableOpacity>
                      )
                   })}
                 </ScrollView>
              )}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                 <TouchableOpacity style={{ flex: 1, padding: 12, backgroundColor: '#333', borderRadius: 12, alignItems: 'center' }} onPress={() => setShowAddMember(false)}>
                   <Text style={{ color: '#FFF' }}>Annuler</Text>
                 </TouchableOpacity>
                 {contacts.length > 0 && (
                   <TouchableOpacity style={{ flex: 1, padding: 12, backgroundColor: '#C5A03B', borderRadius: 12, alignItems: 'center', opacity: selectedUsernames.length === 0 ? 0.5 : 1 }} onPress={handleAddMembers} disabled={selectedUsernames.length === 0}>
                     <Text style={{ color: '#000', fontWeight: 'bold' }}>Ajouter</Text>
                   </TouchableOpacity>
                 )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {user && (
        isPending ? (
          <View style={{ padding: 24, borderTopWidth: 1, borderColor: '#333', alignItems: 'center' }}>
            {amIAdmin ? (
              <Text style={{ color: '#888' }}>⏳ En attente de l'acceptation de l'utilisateur...</Text>
            ) : (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <Text style={{ color: '#C5A03B' }}>🤝 Ce contact souhaite discuter avec vous.</Text>
                <TouchableOpacity onPress={handleAccept} style={{ backgroundColor: '#C5A03B', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}>
                  <Text style={{ color: '#000', fontWeight: 'bold' }}>Accepter pour discuter</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <MessageInput onSend={handleSend} onTyping={sendTypingEvent} replyingTo={replyingTo} onCancelReply={() => setReplyingTo(null)} />
        )
      )}

      {/* Full Screen Image Viewer */}
      {viewImage && (
        <Modal transparent animationType="fade" visible={!!viewImage} onRequestClose={() => setViewImage(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setViewImage(null)}>
            <Image source={{ uri: viewImage }} style={{ width: '100%', height: '80%', resizeMode: 'contain' }} />
          </TouchableOpacity>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1128' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#C5A03B' },
});
