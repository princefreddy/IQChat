/**
 * Centralized API client for IQChat Mobile.
 * Handles base URL, JWT token injection, and file uploads.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://iqchat-backend.onrender.com';
const WS_BASE = 'wss://iqchat-backend.onrender.com';

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
 * Fetch helper with a timeout using AbortController.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Fetch helper with retries and exponential/fixed backoff.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number; retries?: number; delay?: number } = {}
): Promise<Response> {
  const { retries = 5, delay = 2000, ...fetchOptions } = options;
  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await fetchWithTimeout(url, fetchOptions);
    } catch (err: any) {
      lastError = err;
      // If it's a timeout or network request failed, retry after delay
      if (i < retries - 1) {
        console.log(`[API] Connection attempt ${i + 1} failed. Retrying in ${delay}ms...`, err.message || err);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Make an authenticated API request.
 */
export async function apiFetch(
  path: string, 
  options: RequestInit & { timeout?: number; retries?: number; delay?: number } = {}
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const url = `${BASE_URL}${path}`;
  
  return fetchWithRetry(url, {
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
