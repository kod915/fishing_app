// Domyślnie ścieżki względne: w dev Vite proxuje /api -> backend (vite.config.js),
// w produkcji robi to nginx / load balancer. VITE_API_URL pozwala nadpisać (np. https://api.domen.pl/api).
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Adres serwera Socket.IO. Pusty string = ten sam origin co frontend.
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export const apiRequest = async (endpoint, method = 'GET', body = null) => {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config = {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Wystąpił błąd podczas połączenia z serwerem');
  }
  return data;
};
