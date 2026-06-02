/**
 * Centralized API client for IQChat.
 * Handles base URL, JWT token injection, and error handling.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE = BASE_URL.replace(/^http/, 'ws');

/**
 * Get the stored auth data (token + user) from localStorage.
 */
export function getAuthData(): { token: string; user: any } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('iqchat_auth');
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
export function setAuthData(data: { token: string; user: any }) {
  localStorage.setItem('iqchat_auth', JSON.stringify(data));
  // Also keep legacy key for backward compat
  localStorage.setItem('iqchat_user', JSON.stringify(data.user));
}

/**
 * Clear all auth data on logout.
 */
export function clearAuthData() {
  localStorage.removeItem('iqchat_auth');
  localStorage.removeItem('iqchat_user');
}

/**
 * Get default headers with JWT token.
 */
function getHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  
  const auth = getAuthData();
  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  // Legacy fallback
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
  const { timeout = 15000, ...fetchOptions } = options;
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
  const { retries = 3, delay = 3000, ...fetchOptions } = options;
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
  const url = `${BASE_URL}${path}`;
  const headers = getHeaders(options.headers as Record<string, string>);
  
  return fetchWithRetry(url, {
    ...options,
    headers,
  });
}

/**
 * Upload a file to the server.
 */
export async function uploadFile(file: File): Promise<{
  success: boolean;
  url: string;
  file_type: string;
  original_name: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  
  const auth = getAuthData();
  const headers: Record<string, string> = {};
  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  if (auth?.user?.id) {
    headers['x-user-id'] = auth.user.id;
  }
  
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
  if (path.startsWith('http')) return path;
  return `${BASE_URL}${path}`;
}

export { BASE_URL, WS_BASE };
