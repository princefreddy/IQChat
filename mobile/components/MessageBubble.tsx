import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { getUploadUrl, BASE_URL, apiFetch } from '../lib/api';

import TicTacToe from './games/TicTacToe';
import Connect4 from './games/Connect4';
import RockPaperScissors from './games/RockPaperScissors';
import WordMystery from './games/WordMystery';

export default function MessageBubble({ message, isOwn, currentUserId, onReaction, onReply }: any) {
  const [isRevealed, setIsRevealed] = useState(false);
  
  const getInitialTimeLeft = () => {
    if (message.type === 'ephemeral' && message.expires_at) {
      const expiresAt = new Date(message.expires_at.endsWith('Z') ? message.expires_at : message.expires_at + 'Z').getTime();
      const diff = Math.floor((expiresAt - Date.now()) / 1000);
      return diff > 0 ? diff : 0;
    }
    return null;
  };
  
  const [timeLeft, setTimeLeft] = useState(getInitialTimeLeft());
  const [linkPreview, setLinkPreview] = useState<any>(null);

  const isHidden = message.type === 'hidden' && !isOwn;
  const isTimeLocked = message.visible_at && new Date(message.visible_at).getTime() > Date.now() && !isOwn;
  const [lockRemaining, setLockRemaining] = useState('...');

  useEffect(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = message.content?.match(urlRegex);
    if (match && match[0] && !isHidden && !message.is_anonymous) {
       apiFetch(`/utils/link-preview?url=${encodeURIComponent(match[0])}`)
         .then(r => r.json())
         .then(data => {
            if (data.title || data.image) setLinkPreview(data);
         })
         .catch(() => {});
    }
  }, [message.content, isHidden, message.is_anonymous]);

  useEffect(() => {
    if (isTimeLocked) {
      const timer = setInterval(() => {
        const diff = new Date(message.visible_at).getTime() - Date.now();
        if (diff <= 0) {
           setLockRemaining('');
        } else {
           const h = Math.floor(diff / 3600000);
           const m = Math.floor((diff % 3600000) / 60000);
           const s = Math.floor((diff % 60000) / 1000);
           setLockRemaining(`${h}h ${m}m ${s}s`);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [message.visible_at, isTimeLocked]);

  useEffect(() => {
    if (message.type === 'ephemeral' && message.expires_at && !isOwn) {
      const checkExpiry = () => {
        const expiresAt = new Date(message.expires_at.endsWith('Z') ? message.expires_at : message.expires_at + 'Z').getTime();
        const diff = Math.floor((expiresAt - Date.now()) / 1000);
        setTimeLeft(diff > 0 ? diff : 0);
      };
      checkExpiry();
      const timer = setInterval(checkExpiry, 1000);
      return () => clearInterval(timer);
    }
  }, [message.expires_at, isOwn]);

  if (isTimeLocked && lockRemaining) {
    return (
      <View style={[styles.container, isOwn ? styles.alignRight : styles.alignLeft, { opacity: 0.8 }]}>
        <Text style={{ fontSize: 10, color: '#C5A03B', marginBottom: 4, textTransform: 'uppercase', opacity: 0.8 }}>
          ⏰ Message Différé
        </Text>
        <View style={{ padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#C5A03B' }}>
           <Text style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginBottom: 6 }}>Ce message sera visible par {isOwn ? 'le destinataire' : 'vous'} dans {lockRemaining}.</Text>
           <Text style={{ fontSize: 14, color: '#C5A03B', fontWeight: 'bold' }}>🔒 Contenu verrouillé</Text>
        </View>
      </View>
    );
  }

  if (message.type === 'ephemeral' && !isOwn && timeLeft !== null && timeLeft <= 0) {
    return (
      <View style={[styles.container, isOwn ? styles.alignRight : styles.alignLeft, { opacity: 0.5 }]}>
        <View style={{ padding: 8, borderRadius: 16, borderWidth: 1, borderColor: '#333', borderStyle: 'dashed' }}>
           <Text style={{ fontSize: 12, fontStyle: 'italic', color: '#888' }}>Ce message éphémère a disparu.</Text>
        </View>
      </View>
    );
  }

  const timeStr = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Render file attachment
  const renderAttachment = () => {
    if (!message.file_url) return null;
    const url = getUploadUrl(message.file_url);

    if (message.file_type === 'image') {
      return (
        <TouchableOpacity onPress={() => Linking.openURL(url)} style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden' }}>
          <Image source={{ uri: url }} style={{ width: 250, height: 200, borderRadius: 8 }} resizeMode="cover" />
        </TouchableOpacity>
      );
    }

    if (message.file_type === 'video') {
      return (
        <View style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden' }}>
          <Video
            source={{ uri: url }}
            style={{ width: 250, height: 180, borderRadius: 8 }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
          />
        </View>
      );
    }

    if (message.file_type === 'audio') {
      return (
        <View style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.3)', padding: 4 }}>
          <Video
            source={{ uri: url }}
            style={{ width: 220, height: 45 }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
          />
        </View>
      );
    }

    // Generic file
    return (
      <TouchableOpacity onPress={() => Linking.openURL(url)} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, borderWidth: 1, borderColor: '#333' }}>
        <Text style={{ fontSize: 24 }}>📎</Text>
        <View>
          <Text style={{ color: '#C5A03B', fontSize: 13, fontWeight: '500' }}>{message.file_name || 'Fichier'}</Text>
          <Text style={{ color: '#888', fontSize: 11 }}>Appuyer pour télécharger</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isOwn ? styles.alignRight : styles.alignLeft]}>
      
      {/* Type Labels */}
      {(message.type === 'hidden' || message.type === 'ephemeral' || message.visible_at) && (
        <Text style={{ fontSize: 10, color: '#C5A03B', marginBottom: 4, textTransform: 'uppercase', opacity: 0.8 }}>
          {message.type === 'hidden' ? '👁️ Message Caché' : (message.type === 'ephemeral' ? '⏳ Message Éphémère' : '⏰ Message Différé')}
        </Text>
      )}

      {!isOwn && (
        <View style={styles.senderInfo}>
          {message.is_anonymous ? (
             <Text style={styles.senderText}>👤 Anonyme</Text>
          ) : (
             <>
               <Image source={{ uri: message.sender_avatar }} style={styles.avatar} />
               <Text style={styles.senderText}>{message.sender_username}</Text>
             </>
          )}
        </View>
      )}

      <View style={{ position: 'relative' }}>
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={() => { if (isHidden) setIsRevealed(!isRevealed); }}
            style={[
              styles.bubble, 
              isOwn ? styles.bubbleOwn : styles.bubbleOther,
              (isHidden && !isRevealed) && styles.bubbleHidden
            ]}
          >
            {(isHidden && !isRevealed) ? (
              <Text style={styles.hiddenText}>👀 Appuie pour voir</Text>
            ) : (
              <View>
                {/* Reply Block */}
                {message.reply_to_id && (
                  <View style={{ 
                    backgroundColor: 'rgba(0,0,0,0.2)', 
                    borderLeftWidth: 4, 
                    borderLeftColor: isOwn ? 'rgba(255,255,255,0.5)' : '#C5A03B', 
                    padding: 6, 
                    borderRadius: 6, 
                    marginBottom: 6 
                  }}>
                    <Text style={{ color: isOwn ? 'rgba(255,255,255,0.7)' : '#C5A03B', fontWeight: 'bold', fontSize: 12, marginBottom: 2 }}>
                      {message.reply_to_sender || "Anonyme"}
                    </Text>
                    <Text style={{ color: '#ccc', fontSize: 12 }} numberOfLines={1}>
                      {message.reply_to_content || "Message supprimé"}
                    </Text>
                  </View>
                )}

                {/* Text content or Game */}
                {message.type === 'game_tictactoe' ? (
                  <TicTacToe message={message} currentUserId={currentUserId} />
                ) : message.type === 'game_connect4' ? (
                  <Connect4 message={message} currentUserId={currentUserId} />
                ) : message.type === 'game_rps' ? (
                  <RockPaperScissors message={message} currentUserId={currentUserId} />
                ) : message.type === 'game_word_mystery' ? (
                  <WordMystery message={message} currentUserId={currentUserId} />
                ) : (
                  message.content ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
                        {message.content.split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) => 
                          part.match(/^https?:\/\//) ? (
                            <Text key={i} style={{ color: '#C5A03B', textDecorationLine: 'underline' }} onPress={() => Linking.openURL(part)}>{part}</Text>
                          ) : part
                        )}
                      </Text>
                    </View>
                  ) : null
                )}

                {/* File attachment */}
                {renderAttachment()}
                
                {/* Time + Read receipts */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                  <Text style={{ fontSize: 10, color: isOwn ? 'rgba(255,255,255,0.6)' : '#888' }}>{timeStr}</Text>
                  {isOwn && (
                    <Text style={{ fontSize: 11, color: message.is_read ? '#60a5fa' : 'rgba(255,255,255,0.4)' }}>
                      {message.is_read ? '✓✓' : '✓'}
                    </Text>
                  )}
                </View>
                
                {linkPreview && (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => Linking.openURL(linkPreview.url)} style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: '#333' }}>
                    {linkPreview.image && <Image source={{ uri: linkPreview.image }} style={{ width: '100%', height: 120, resizeMode: 'cover' }} />}
                    <View style={{ padding: 8 }}>
                       <Text style={{ color: '#FFF', fontSize: 14, fontWeight: 'bold' }} numberOfLines={1}>{linkPreview.title || linkPreview.url}</Text>
                       {linkPreview.description && <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }} numberOfLines={2}>{linkPreview.description}</Text>}
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {(message.type === 'ephemeral' && timeLeft !== null && !isOwn) && (
              <Text style={styles.ephemeralText}>⏳ {timeLeft}s left</Text>
            )}
          </TouchableOpacity>

          {/* Persistent Reaction */}
          {message.reaction && (
              <View style={[styles.reactionBadge, isOwn ? { left: 8 } : { right: 8 }]}>
                <Text style={{ fontSize: 14 }}>{message.reaction}</Text>
              </View>
          )}
      </View>

      {/* Actions Block (Reactions + Reply) */}
      {!isOwn && (
        <View style={styles.reactionBar}>
           {!message.reaction && ['👍', '❤️', '😂', '😮', '🔥'].map(emoji => (
             <TouchableOpacity key={emoji} onPress={() => onReaction(message.id, emoji)}>
               <Text style={styles.reactionEmoji}>{emoji}</Text>
             </TouchableOpacity>
           ))}
           {onReply && (
             <TouchableOpacity onPress={() => onReply(message)} style={{ marginLeft: 8, paddingHorizontal: 4 }}>
               <Text style={styles.reactionEmoji}>↩️</Text>
             </TouchableOpacity>
           )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 12, maxWidth: '85%' },
  alignRight: { alignSelf: 'flex-end' },
  alignLeft: { alignSelf: 'flex-start' },
  senderInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, marginLeft: 4, gap: 4 },
  avatar: { width: 16, height: 16, borderRadius: 8 },
  senderText: { fontSize: 12, color: '#888' },
  bubble: { padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
  bubbleOwn: { backgroundColor: '#2E5B88', borderBottomRightRadius: 4, borderColor: '#1C3D60' },
  bubbleOther: { backgroundColor: 'rgba(255,255,255,0.05)', borderBottomLeftRadius: 4 },
  bubbleHidden: { backgroundColor: 'rgba(255,255,255,0.1)' },
  hiddenText: { color: '#FFF', fontWeight: 'bold' },
  text: { fontSize: 16 },
  textOwn: { color: '#FFF' },
  textOther: { color: '#FFF' },
  ephemeralText: { fontSize: 10, color: '#C5A03B', marginTop: 4, textAlign: 'right' },
  reactionBar: { flexDirection: 'row', gap: 8, marginTop: 4, opacity: 0.5 },
  reactionEmoji: { fontSize: 16 },
  reactionBadge: { position: 'absolute', bottom: -12, backgroundColor: '#222', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#C5A03B' }
});
