// Domyślnie ścieżki względne: w dev Vite proxuje /api -> backend (vite.config.js),
// w produkcji robi to nginx / load balancer. VITE_API_URL pozwala nadpisać (np. https://api.domen.pl/api).
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Adres serwera Socket.IO. Pusty string = ten sam origin co frontend.
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const saveSession = ({ token, user }) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

/** Czy JWT w localStorage jest jeszcze ważny (z 10-sekundowym marginesem). */
export const hasValidToken = () => {
  try {
    const token = getToken();
    if (!token) return false;
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    return exp * 1000 > Date.now() + 10_000;
  } catch {
    return false;
  }
};

// Jedno odświeżanie naraz – równoległe żądania z wygasłym tokenem czekają na ten sam wynik.
let refreshPromise = null;

/**
 * Wymienia refresh token (cookie HttpOnly, wysyłane automatycznie) na nowy JWT.
 * Zwraca użytkownika albo null, gdy sesja wygasła.
 */
export const tryRefresh = () => {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('refresh failed');
        const data = await r.json();
        saveSession(data);
        return data.user;
      })
      .catch(() => {
        clearSession();
        window.dispatchEvent(new Event('auth:logout'));
        return null;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
};

/** Zwraca ważny token – odświeża, jeśli obecny wygasł. */
export const ensureToken = async () => {
  if (hasValidToken()) return getToken();
  await tryRefresh();
  return getToken();
};

const isAuthEndpoint = (endpoint) => endpoint.startsWith('/auth/');

export const apiRequest = async (endpoint, method = 'GET', body = null, { retry = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  // Dla zwykłych wywołań dbamy o ważny token zawczasu; endpointy /auth/* idą bez niego
  const token = isAuthEndpoint(endpoint) ? getToken() : await ensureToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
    credentials: 'include', // cookie refresh tokena (ten sam origin)
  });

  // Token odrzucony mimo wszystko (np. zmiana sekretu) – spróbuj raz odświeżyć i powtórzyć
  if (response.status === 401 && retry && !isAuthEndpoint(endpoint) && token) {
    const user = await tryRefresh();
    if (user) return apiRequest(endpoint, method, body, { retry: false });
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Wystąpił błąd podczas połączenia z serwerem');
  }
  return data;
};

export const logoutRequest = async () => {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } finally {
    clearSession();
  }
};
