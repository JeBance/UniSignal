import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерцептор для добавления admin key
api.interceptors.request.use((config) => {
  const adminKey = localStorage.getItem('adminKey');
  if (adminKey && config.url?.startsWith('/admin')) {
    config.headers['X-Admin-Key'] = adminKey;
  }
  return config;
});

export interface Stats {
  messages: {
    total: number;
    today: number;
    with_ticker: number;
    long_count: number;
    short_count: number;
  };
  channels: {
    active: number;
  };
  clients: {
    total: number;
    active: number;
  };
}

export interface Client {
  id: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
}

export interface Channel {
  chat_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: number;
  channel: string;
  direction: 'LONG' | 'SHORT' | null;
  ticker: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  text: string;
  timestamp: number;
}

export const unisignalApi = {
  // Health check
  health: () => api.get('/health'),

  // Stats
  getStats: () => api.get<Stats>('/admin/stats'),

  // Clients
  getClients: () => api.get<{ clients: Client[] }>('/admin/clients'),
  createClient: () => api.post<Client>('/admin/clients'),
  deleteClient: (id: string) => api.delete(`/admin/clients/${id}`),

  // Channels
  getChannels: (all = false) =>
    api.get<{ channels: Channel[] }>(`/admin/channels${all ? '?all=true' : ''}`),
  addChannel: (chat_id: number, name: string, is_active = true) =>
    api.post<Channel>('/admin/channels', { chat_id, name, is_active }),
  deleteChannel: (chatId: number) => api.delete(`/admin/channels/${chatId}`),
  toggleChannel: (chatId: number, is_active: boolean) =>
    api.patch(`/admin/channels/${chatId}/toggle`, { is_active }),

  // WebSocket
  connectWebSocket: (apiKey: string) => {
    const ws = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/ws`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: 'auth', api_key: apiKey }));
    };

    return ws;
  },
};

export default api;
