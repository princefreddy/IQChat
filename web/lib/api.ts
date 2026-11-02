/**
 * Centralized API client for HomiChat Web.
 * Handles base URL, JWT token injection, session cache cleanup, and safe retries.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");
const WS_BASE = BASE_URL.replace(/^http/, "ws");

export const chatMemoryCache: Record<string, { chatInfo: any; messages: any[] }> = {};

export function clearChatMemoryCache() {
  for (const key of Object.keys(chatMemoryCache)) {
    delete chatMemoryCache[key];
  }
}

/**
 * Get the stored auth data (token + user) from localStorage.
 */
export function getAuthData(): { token: string; user: any } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("homichat_auth") || localStorage.getItem("iqchat_auth");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save auth data after login/register/profile update.
 */
export function setAuthData(data: { token: string; user: any }) {
  localStorage.setItem("homichat_auth", JSON.stringify(data));
  localStorage.setItem("homichat_user", JSON.stringify(data.user));
}

/**
 * Clear all auth data and in-memory caches on logout.
 */
export function clearAuthData() {
  clearChatMemoryCache();
  if (typeof window !== "undefined") {
    localStorage.removeItem("homichat_auth");
    localStorage.removeItem("homichat_user");
    localStorage.removeItem("iqchat_auth");
    localStorage.removeItem("iqchat_user");
  }
}

/**
 * Get default headers with JWT token.
 */
function getHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  const auth = getAuthData();
  if (auth?.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
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
 * Fetch helper with retries (safe default: retries only idempotent GET/HEAD requests unless explicitly requested).
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number; retries?: number; delay?: number } = {}
): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const defaultRetries = method === "GET" || method === "HEAD" ? 3 : 1;
  const { retries = defaultRetries, delay = 1500, ...fetchOptions } = options;
  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await fetchWithTimeout(url, fetchOptions);
    } catch (err: any) {
      lastError = err;
      if (i < retries - 1) {
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
  formData.append("file", file);

  const auth = getAuthData();
  const headers: Record<string, string> = {};
  if (auth?.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  const res = await fetch(`${BASE_URL}/messages/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Échec de l'envoi du fichier");
  }

  return res.json();
}

/**
 * Get the WebSocket URL for a chat.
 */
export function getChatWsUrl(chatId: string, userId: string): string {
  const auth = getAuthData();
  const tokenParam = auth?.token ? `&token=${encodeURIComponent(auth.token)}` : "";
  return `${WS_BASE}/ws/chat/${chatId}?user_id=${encodeURIComponent(userId)}${tokenParam}`;
}

/**
 * Get the global user WebSocket URL for presence & real-time sidebar updates.
 */
export function getUserWsUrl(userId: string): string {
  const auth = getAuthData();
  const tokenParam = auth?.token ? `&token=${encodeURIComponent(auth.token)}` : "";
  return `${WS_BASE}/ws/user?user_id=${encodeURIComponent(userId)}${tokenParam}`;
}

/**
 * Get the full URL for an uploaded file.
 */
export function getUploadUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${BASE_URL}${path}`;
}

export { BASE_URL, WS_BASE };
