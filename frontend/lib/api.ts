export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Authenticated fetch wrapper for the backend API.
 * Pass the Clerk token from `useAuth().getToken()`.
 * For endpoints that don't require auth, pass `null` as the token.
 */
export async function apiFetch(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(init.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(`${API_URL}${path}`, { ...init, headers });
}
