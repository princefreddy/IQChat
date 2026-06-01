import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { uploadFile } from '../lib/api';

export default function MessageInput({ onSend, onTyping, replyingTo, onCancelReply }: { onSend: (data: any) => void; onTyping?: (isTyping: boolean) => void; replyingTo?: any; onCancelReply?: () => void }) {
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [msgType, setMsgType] = useState('normal'); 
  const [ephemeralTtl, setEphemeralTtl] = useState(10);
  const [delayedDate, setDelayedDate] = useState(new Date(Date.now() + 3600000));
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; file_type: string; file_name: string } | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording: newRecording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        setRecording(newRecording);
        setIsRecording(true);
        setRecordingDuration(0);
        timerRef.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
      } else {
        Alert.alert('Permission requise', 'Veuillez autoriser l\'accès au microphone.');
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) return;
      
      setUploadingFile(true);
      try {
        const uploaded = await uploadFile(uri, 'voice_message.m4a', 'audio/mp4');
        setPendingFile({
          url: uploaded.url,
          file_type: 'audio',
          file_name: 'voice_message.m4a',
        });
        if (!content.trim()) setContent('🎤 Message vocal');
      } catch (err: any) {
        Alert.alert('Erreur', err.message || 'Échec de l\'upload vocal');
      }
      setUploadingFile(false);
    } catch (err) {
       console.error(err);
    }
    setRecording(null);
  };

  const cancelRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      await recording.stopAndUnloadAsync();
    } catch (err) {}
    setRecording(null);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Typing indicator
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const handleTyping = useCallback(() => {
    if (!onTyping) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping(false);
    }, 2000);
  }, [onTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current && onTyping) onTyping(false);
    };
  }, [onTyping]);

  const ttlOptions = [
    { label: '5s', value: 5 },
    { label: '10s', value: 10 },
    { label: '1h', value: 3600 },
    { label: '2h', value: 7200 },
    { label: '24h', value: 86400 }
  ];

  const [showGameMenu, setShowGameMenu] = useState(false);
  const [wordMysteryInput, setWordMysteryInput] = useState('');
  const [showWordInput, setShowWordInput] = useState(false);

  const startGame = (type: string, extraData: any = {}) => {
    let contentObj: any = {
      player_x: null,
      player_o: null,
      winner: null,
      status: "playing"
    };

    if (type === 'game_tictactoe') {
      contentObj.board = ["", "", "", "", "", "", "", "", ""];
      contentObj.current_turn = "x";
    } else if (type === 'game_connect4') {
      contentObj.board = Array(42).fill("");
      contentObj.current_turn = "x";
    } else if (type === 'game_rps') {
      contentObj.player_x_choice = null;
      contentObj.player_o_choice = null;
    } else if (type === 'game_word_mystery') {
      if (!wordMysteryInput.trim()) return;
      contentObj.target_word = wordMysteryInput.toUpperCase();
      contentObj.guesses = [];
    }

    onSend({
      content: JSON.stringify({ ...contentObj, ...extraData }),
      type: type,
      is_anonymous: false,
      ttl: null,
      visible_at: null,
      file_url: null,
      file_type: null,
      file_name: null,
      reply_to_id: replyingTo?.id,
    });
    if (onCancelReply) onCancelReply();
    setShowGameMenu(false);
    setShowWordInput(false);
    setWordMysteryInput('');
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileName = asset.fileName || `file_${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
        const mimeType = asset.type === 'video' ? 'video/mp4' : 'image/jpeg';
        
        setUploadingFile(true);
        try {
          const uploaded = await uploadFile(asset.uri, fileName, mimeType);
          setPendingFile({
            url: uploaded.url,
            file_type: uploaded.file_type,
            file_name: uploaded.original_name,
          });
        } catch (err: any) {
          Alert.alert('Erreur', err.message || 'Échec de l\'upload');
        }
        setUploadingFile(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setUploadingFile(true);
        try {
          const uploaded = await uploadFile(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
          setPendingFile({
            url: uploaded.url,
            file_type: uploaded.file_type,
            file_name: uploaded.original_name,
          });
        } catch (err: any) {
          Alert.alert('Erreur', err.message || 'Échec de l\'upload');
        }
        setUploadingFile(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = () => {
    if (!content.trim() && !pendingFile) return;
    
    let finalType = msgType === 'delayed' ? 'normal' : msgType;
    let computedVisibleAt = null;
    if (msgType === 'delayed') {
      computedVisibleAt = delayedDate.toISOString();
    }

    onSend({
      content: content || (pendingFile ? `📎 ${pendingFile.file_name}` : ''),
      type: finalType,
      is_anonymous: isAnonymous,
      ttl: msgType === 'ephemeral' ? ephemeralTtl : null,
      visible_at: computedVisibleAt,
      file_url: pendingFile?.url || null,
      file_type: pendingFile?.file_type || null,
      file_name: pendingFile?.file_name || null,
      reply_to_id: replyingTo?.id,
    });
    setContent('');
    setPendingFile(null);
  };

  return (
    <View style={styles.container}>
      {/* Replying To Banner */}
      {replyingTo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#C5A03B', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#C5A03B' }}>Réponse à {replyingTo.sender_username || "Anonyme"}</Text>
            <Text style={{ fontSize: 13, color: '#ccc' }} numberOfLines={1}>
              {replyingTo.file_type === 'audio' ? '🎤 Message vocal' : replyingTo.file_type ? '📎 Pièce jointe' : replyingTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} style={{ padding: 4 }}>
            <Text style={{ color: '#ff4d4f', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <View style={styles.filePreview}>
          <Text style={{ fontSize: 20 }}>
            {pendingFile.file_type === 'image' ? '🖼️' : pendingFile.file_type === 'video' ? '🎬' : pendingFile.file_type === 'audio' ? '🎵' : '📎'}
          </Text>
          <Text style={{ flex: 1, color: '#C5A03B', fontSize: 13 }} numberOfLines={1}>{pendingFile.file_name}</Text>
          <TouchableOpacity onPress={() => setPendingFile(null)}>
            <Text style={{ color: '#ff4d4f', fontSize: 14, fontWeight: 'bold' }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.toggles}>
        {['normal', 'hidden', 'ephemeral', 'delayed'].map(type => (
          <TouchableOpacity 
            key={type} 
            onPress={() => setMsgType(type)}
            style={[styles.toggleBtn, msgType === type && styles.activeToggle]}
          >
            <Text style={[styles.toggleText, msgType === type && styles.activeToggleText]}>
              {type === 'hidden' ? '👀 Caché' : type === 'ephemeral' ? '⏳ Éphémère' : type === 'delayed' ? '⏰ Différé' : 'Normal'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity 
          onPress={() => setIsAnonymous(!isAnonymous)}
          style={[styles.toggleBtn, isAnonymous && styles.activeToggle]}
        >
          <Text style={[styles.toggleText, isAnonymous && styles.activeToggleText]}>
            👤 {isAnonymous ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {msgType === 'delayed' && (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, paddingLeft: 4, alignItems: 'center' }}>
          <Text style={{ color: '#888', fontSize: 12 }}>Visible le :</Text>
          <TouchableOpacity onPress={() => { setPickerMode('date'); setShowPicker(true); }} style={{ padding: 6, borderWidth: 1, borderColor: '#444', borderRadius: 8 }}>
             <Text style={{ color: '#C5A03B', fontSize: 12 }}>{delayedDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setPickerMode('time'); setShowPicker(true); }} style={{ padding: 6, borderWidth: 1, borderColor: '#444', borderRadius: 8 }}>
             <Text style={{ color: '#C5A03B', fontSize: 12 }}>{delayedDate.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={delayedDate}
              mode={pickerMode}
              is24Hour={true}
              display="default"
              onChange={(event: any, selectedDate?: Date) => {
                setShowPicker(Platform.OS === 'ios');
                if (selectedDate) setDelayedDate(selectedDate);
              }}
            />
          )}
        </View>
      )}

      {msgType === 'ephemeral' && (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, paddingLeft: 4 }}>
          {ttlOptions.map(opt => (
            <TouchableOpacity 
              key={opt.value} 
              onPress={() => setEphemeralTtl(opt.value)}
              style={[
                 { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#444' },
                 ephemeralTtl === opt.value && { borderColor: '#C5A03B', backgroundColor: 'rgba(212,175,55,0.1)' }
              ]}
            >
              <Text style={{ color: ephemeralTtl === opt.value ? '#C5A03B' : '#888', fontSize: 10 }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        {/* File upload buttons */}
        <TouchableOpacity onPress={handlePickImage} disabled={uploadingFile} style={styles.attachBtn}>
          {uploadingFile ? <ActivityIndicator size="small" color="#C5A03B" /> : <Text style={{ fontSize: 18 }}>🖼️</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePickDocument} disabled={uploadingFile} style={styles.attachBtn}>
          <Text style={{ fontSize: 18 }}>📎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setShowGameMenu(true); setShowWordInput(false); setWordMysteryInput(''); }} style={styles.attachBtn}>
          <Text style={{ fontSize: 18 }}>🎮</Text>
        </TouchableOpacity>

        <TextInput
          style={[styles.input, isRecording && { opacity: 0.5 }]}
          placeholder={isRecording ? `Enregistrement... ${formatDuration(recordingDuration)}` : "Écrivez un message..."}
          placeholderTextColor={isRecording ? '#C5A03B' : "#888"}
          value={content}
          onChangeText={(text) => { setContent(text); handleTyping(); }}
          editable={!isRecording}
        />

        {isRecording ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={cancelRecording} style={styles.cancelVoiceBtn}>
              <Text style={{ fontSize: 18 }}>🗑️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={stopRecording} style={styles.sendBtn}>
              <Text style={{ fontSize: 18, color: '#000', fontWeight: 'bold' }}>⏹️</Text>
            </TouchableOpacity>
          </View>
        ) : (
          (!content.trim() && !pendingFile) ? (
            <TouchableOpacity style={styles.micBtn} onPress={startRecording}>
              <Text style={{ fontSize: 18 }}>🎤</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
              <Text style={styles.sendText}>🚀</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <Modal visible={showGameMenu} transparent animationType="slide">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setShowGameMenu(false)}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: '#111D36', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Catalogue de Mini-Jeux</Text>
            
            {!showWordInput ? (
              <View style={{ gap: 12 }}>
                <TouchableOpacity onPress={() => startGame('game_tictactoe')} style={styles.gameMenuBtn}>
                  <Text style={styles.gameMenuBtnText}>🎮 Morpion</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => startGame('game_connect4')} style={styles.gameMenuBtn}>
                  <Text style={styles.gameMenuBtnText}>🔴🟡 Puissance 4</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => startGame('game_rps')} style={styles.gameMenuBtn}>
                  <Text style={styles.gameMenuBtnText}>✂️📄 Pierre-Papier-Ciseaux</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowWordInput(true)} style={styles.gameMenuBtn}>
                  <Text style={styles.gameMenuBtnText}>🧠 Le Mot Mystère</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={{ color: '#888', fontSize: 14 }}>Choisissez un mot à faire deviner :</Text>
                <TextInput
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#FFF', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#333' }}
                  placeholder="BATEAU"
                  placeholderTextColor="#666"
                  value={wordMysteryInput}
                  onChangeText={(t) => setWordMysteryInput(t.toUpperCase())}
                  autoCapitalize="characters"
                />
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => setShowWordInput(false)} style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', alignItems: 'center' }}>
                    <Text style={{ color: '#FFF' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => startGame('game_word_mystery')} 
                    disabled={!wordMysteryInput.trim()} 
                    style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: wordMysteryInput.trim() ? '#C5A03B' : '#555', alignItems: 'center' }}
                  >
                    <Text style={{ color: '#000', fontWeight: 'bold' }}>Lancer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: '#111D36', borderTopWidth: 1, borderColor: '#333' },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#444' },
  activeToggle: { borderColor: '#C5A03B', backgroundColor: 'rgba(212,175,55,0.1)' },
  toggleText: { color: '#AAA', fontSize: 12 },
  activeToggleText: { color: '#C5A03B' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF' },
  sendBtn: { backgroundColor: '#C5A03B', borderRadius: 20, padding: 10, justifyContent: 'center', alignItems: 'center' },
  sendText: { fontSize: 18 },
  micBtn: { padding: 10, borderRadius: 20, borderWidth: 1, borderColor: '#C5A03B', justifyContent: 'center', alignItems: 'center' },
  cancelVoiceBtn: { padding: 10, borderRadius: 20, borderWidth: 1, borderColor: '#ff4d4f', justifyContent: 'center', alignItems: 'center' },
  attachBtn: { padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  filePreview: { 
    flexDirection: 'row', alignItems: 'center', gap: 10, 
    padding: 8, marginBottom: 8, 
    backgroundColor: 'rgba(212,175,55,0.1)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)', borderRadius: 8 
  },
  gameMenuBtn: { padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  gameMenuBtnText: { color: '#FFF', fontSize: 16 }
});
