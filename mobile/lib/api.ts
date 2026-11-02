/**
 * Centralized API client for HomiChat Mobile.
 * Handles base URL, JWT token injection, session cache cleanup, and file uploads.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { File as ExpoFile } from "expo-file-system";
import { Platform } from "react-native";

function resolveBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const hostUri = Constants.expoConfig?.hostUri;
    const lanHost = hostUri?.split(":")[0];
    if (lanHost && /^\d+\.\d+\.\d+\.\d+$/.test(lanHost)) {
      return `http://${lanHost}:8000`;
    }
  }
  return "https://iqchat-backend.onrender.com";
}

const BASE_URL = resolveBaseUrl();
const WS_BASE = BASE_URL.replace(/^http/, "ws");

export interface AuthData {
  token: string;
  user: any;
}

export const chatMemoryCache: Record<string, { chatInfo: any; messages: any[] }> = {};

export function clearChatMemoryCache() {
  for (const key of Object.keys(chatMemoryCache)) {
    delete chatMemoryCache[key];
  }
}

/**
 * Get stored auth data (token + user).
 */
export async function getAuthData(): Promise<AuthData | null> {
  const raw =
    (await AsyncStorage.getItem("homichat_auth")) ||
    (await AsyncStorage.getItem("iqchat_auth"));
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
export async function setAuthData(data: AuthData) {
  await AsyncStorage.setItem("homichat_auth", JSON.stringify(data));
  await AsyncStorage.setItem("homichat_user", JSON.stringify(data.user));
}

/**
 * Clear all auth data and in-memory caches on logout.
 */
export async function clearAuthData() {
  clearChatMemoryCache();
  await AsyncStorage.removeItem("homichat_auth");
  await AsyncStorage.removeItem("homichat_user");
  await AsyncStorage.removeItem("iqchat_auth");
  await AsyncStorage.removeItem("iqchat_user");
}

/**
 * Get default headers with JWT token.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const auth = await getAuthData();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
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
 * Fetch helper with retries (safe default: retries only GET/HEAD requests unless explicitly requested).
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
 * Upload a file to the server (compatible with Expo SDK 58 `expo/fetch` + native `expo-file-system`).
 */
export async function uploadFile(
  uri: string,
  fileName: string,
  mimeType: string
): Promise<{
  success: boolean;
  url: string;
  file_type: string;
  original_name: string;
}> {
  const auth = await getAuthData();
  const formData = new FormData();

  if (Platform.OS === "web") {
    const fileRes = await fetch(uri);
    const blob = await fileRes.blob();
    formData.append("file", blob, fileName);
  } else {
    const normalizedUri =
      uri.startsWith("file://") || uri.startsWith("content://") ? uri : `file://${uri}`;
    const expoFile = new ExpoFile(normalizedUri);
    formData.append(
      "file",
      {
        name: fileName || expoFile.name || "attachment",
        type: mimeType || expoFile.type || "application/octet-stream",
        bytes: () => expoFile.bytes(),
      } as any
    );
  }

  const headers: Record<string, string> = {};
  if (auth?.token) headers["Authorization"] = `Bearer ${auth.token}`;

  const res = await fetch(`${BASE_URL}/messages/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Échec de l'envoi du fichier");
  }
  return res.json();
}

/**
 * Get the WebSocket URL for a chat.
 */
export function getChatWsUrl(chatId: string, userId: string, token?: string): string {
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
  return `${WS_BASE}/ws/chat/${chatId}?user_id=${encodeURIComponent(userId)}${tokenParam}`;
}

/**
 * Get the global user WebSocket URL for presence & real-time updates.
 */
export function getUserWsUrl(userId: string, token?: string): string {
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
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
