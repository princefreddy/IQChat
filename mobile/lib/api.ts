/**
 * Centralized API client for IQChat Mobile.
 * Handles base URL, JWT token injection, and file uploads.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// Change this to your machine's local IP for physical device testing
const BASE_URL = 'https://iqchatbackend.fly.dev';
const WS_BASE = 'wss://iqchatbackend.fly.dev';

export interface AuthData {
  token: string;
  user: any;
}

/**
 * Get stored auth data (token + user).
 */
export async function getAuthData(): Promise<AuthData | null> {
  const raw = await AsyncStorage.getItem('iqchat_auth');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save auth data after login/register.
 */
export async function setAuthData(data: AuthData) {
  await AsyncStorage.setItem('iqchat_auth', JSON.stringify(data));
  // Legacy compat
  await AsyncStorage.setItem('iqchat_user', JSON.stringify(data.user));
}

/**
 * Clear all auth data on logout.
 */
export async function clearAuthData() {
  await AsyncStorage.removeItem('iqchat_auth');
  await AsyncStorage.removeItem('iqchat_user');
}

/**
 * Get default headers with JWT token.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const auth = await getAuthData();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  if (auth?.user?.id) {
    headers['x-user-id'] = auth.user.id;
  }
  return headers;
}

/**
 * Make an authenticated API request.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers as Record<string, string>),
    },
  });
}

/**
 * Upload a file to the server. Returns the file info.
 */
export async function uploadFile(uri: string, fileName: string, mimeType: string): Promise<{
  success: boolean;
  url: string;
  file_type: string;
  original_name: string;
}> {
  const auth = await getAuthData();
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: fileName,
    type: mimeType,
  } as any);

  const headers: Record<string, string> = {};
  if (auth?.token) headers['Authorization'] = `Bearer ${auth.token}`;
  if (auth?.user?.id) headers['x-user-id'] = auth.user.id;

  const res = await fetch(`${BASE_URL}/messages/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

/**
 * Get the WebSocket URL for a chat.
 */
export function getChatWsUrl(chatId: string, userId: string): string {
  return `${WS_BASE}/ws/chat/${chatId}?user_id=${userId}`;
}

/**
 * Get the full URL for an uploaded file.
 */
export function getUploadUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${BASE_URL}${path}`;
}

export { BASE_URL, WS_BASE };
