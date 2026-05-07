import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { uploadFile } from '../lib/api';

export default function MessageInput({ onSend, onTyping }: { onSend: (data: any) => void; onTyping?: (isTyping: boolean) => void }) {
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
    }, 3000);
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
    });
    setContent('');
    setPendingFile(null);
  };

  return (
    <View style={styles.container}>
      {/* Pending file preview */}
      {pendingFile && (
        <View style={styles.filePreview}>
          <Text style={{ fontSize: 20 }}>
            {pendingFile.file_type === 'image' ? '🖼️' : pendingFile.file_type === 'video' ? '🎬' : pendingFile.file_type === 'audio' ? '🎵' : '📎'}
          </Text>
          <Text style={{ flex: 1, color: '#D4AF37', fontSize: 13 }} numberOfLines={1}>{pendingFile.file_name}</Text>
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
             <Text style={{ color: '#D4AF37', fontSize: 12 }}>{delayedDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setPickerMode('time'); setShowPicker(true); }} style={{ padding: 6, borderWidth: 1, borderColor: '#444', borderRadius: 8 }}>
             <Text style={{ color: '#D4AF37', fontSize: 12 }}>{delayedDate.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}</Text>
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
                 ephemeralTtl === opt.value && { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.1)' }
              ]}
            >
              <Text style={{ color: ephemeralTtl === opt.value ? '#D4AF37' : '#888', fontSize: 10 }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        {/* File upload buttons */}
        <TouchableOpacity onPress={handlePickImage} disabled={uploadingFile} style={styles.attachBtn}>
          {uploadingFile ? <ActivityIndicator size="small" color="#D4AF37" /> : <Text style={{ fontSize: 18 }}>🖼️</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePickDocument} disabled={uploadingFile} style={styles.attachBtn}>
          <Text style={{ fontSize: 18 }}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Écrivez un message..."
          placeholderTextColor="#888"
          value={content}
          onChangeText={(text) => { setContent(text); handleTyping(); }}
        />
        <TouchableOpacity style={[styles.sendBtn, (!content.trim() && !pendingFile) && { opacity: 0.5 }]} onPress={handleSend} disabled={!content.trim() && !pendingFile}>
          <Text style={styles.sendText}>🚀</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: '#171520', borderTopWidth: 1, borderColor: '#333' },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#444' },
  activeToggle: { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.1)' },
  toggleText: { color: '#AAA', fontSize: 12 },
  activeToggleText: { color: '#D4AF37' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF' },
  sendBtn: { backgroundColor: '#D4AF37', borderRadius: 20, padding: 10, justifyContent: 'center', alignItems: 'center' },
  sendText: { fontSize: 18 },
  attachBtn: { padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  filePreview: { 
    flexDirection: 'row', alignItems: 'center', gap: 10, 
    padding: 8, marginBottom: 8, 
    backgroundColor: 'rgba(212,175,55,0.1)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)', borderRadius: 8 
  },
});
