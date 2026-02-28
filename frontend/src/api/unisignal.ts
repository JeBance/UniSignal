import axios from 'axios';

// API URL определяется автоматически из текущего окна браузера
const getApiBaseUrl = () => {
  // Если запущено на сервере (не localhost), используем текущий origin
  if (typeof window !== 'undefined') {
    const currentOrigin = window.location.origin;
    // Если это не localhost, используем текущий origin
    if (!currentOrigin.includes('localhost') && !currentOrigin.includes('127.0.0.1')) {
      return currentOrigin;
    }
  }
  // Для локальной разработки
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерцептор для добавления ключей аутентификации
api.interceptors.request.use((config) => {
  const adminKey = localStorage.getItem('adminKey');
  const apiKey = localStorage.getItem('apiKey');
  const authType = localStorage.getItem('authType');

  // Добавляем соответствующий ключ в зависимости от типа аутентификации
  if (authType === 'admin' && adminKey && config.url?.startsWith('/admin')) {
    config.headers['X-Admin-Key'] = adminKey;
  } else if (authType === 'client' && apiKey && config.url?.startsWith('/api')) {
    config.headers['X-API-Key'] = apiKey;
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

export interface AuthResult {
  valid: boolean;
  role?: 'admin' | 'client';
  clientId?: string;
  error?: string;
}

export interface Channel {
  chat_id: number | string;
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
  parsedSignal?: {
    signal_id: string;
    timestamp: string;
    source: {
      channel: string;
      channel_id: number;
      message_id: number;
      original_text: string;
    };
    signal: {
      type: string;
      priority: number;
      instrument: {
        ticker: string;
        exchange: string;
        project_info?: string;
        asset_type: string;
      };
      timing?: {
        timeframe?: string;
        signal_time?: string;
      };
      direction?: {
        side: 'long' | 'short' | 'neutral';
        strength: 'strong' | 'medium' | 'weak';
        pattern?: string;
        pattern_strength?: number;
        pattern_direction?: 'up' | 'down' | 'neutral';
      };
      indicators?: {
        rsi?: number;
        rsi_signal?: 'oversold' | 'overbought' | 'neutral';
        sentiment?: {
          day_change: number;
          change_24h: number;
          timeframe_zones: Array<{
            timeframe: string;
            zone: 'OS' | 'OB';
            zone_percent: number;
            rsi?: number;
            trend: 'up' | 'down' | 'neutral';
          }>;
        };
      };
      trade_setup?: {
        entry_price?: number;
        current_price?: number;
        targets?: number[];
        stop_loss?: {
          stop_0_5?: number;
          stop_1?: number;
        };
        expected_profit?: string;
      };
      funding_info?: {
        funding_rate: number;
        funding_time: string;
        receiver: 'longs' | 'shorts';
        recommended_action: 'long' | 'short';
        trading_link?: string;
      };
      confidence: {
        score: number;
        factors: string[];
      };
    };
    metadata: {
      parser_version: string;
      processing_time_ms: number;
      language: 'en' | 'ru' | 'mixed';
      tags: string[];
    };
  } | null;
}

export const unisignalApi = {
  // Health check
  health: () => api.get('/health'),

  // Auth validation
  validateAuth: () => api.get<AuthResult>('/api/auth/validate'),

  // Stats (available for both admin and client)
  getStats: () => api.get<Stats>('/api/stats'),

  // Signals (available for both admin and client)
  getSignals: (limit: number = 50) => api.get<{ signals: Signal[] }>(`/api/signals?limit=${limit}`),

  // Admin-only endpoints
  getAdminStats: () => api.get<Stats>('/admin/stats'),
  getAdminSignals: (limit: number = 50) => api.get<{ signals: Signal[] }>(`/admin/signals?limit=${limit}`),

  // Clients
  getClients: () => api.get<{ clients: Client[] }>('/admin/clients'),
  createClient: () => api.post<Client>('/admin/clients'),
  deleteClient: (id: string) => api.delete(`/admin/clients/${id}`),

  // Channels
  getChannels: (all = false) =>
    api.get<{ channels: Channel[] }>(`/admin/channels${all ? '?all=true' : ''}`),
  addChannel: (chat_id: number | string, name: string, is_active = true) =>
    api.post<Channel>('/admin/channels', { chat_id, name, is_active }),
  deleteChannel: (chatId: number | string) => api.delete(`/admin/channels/${chatId}`),
  toggleChannel: (chatId: number | string, is_active: boolean) =>
    api.patch(`/admin/channels/${chatId}/toggle`, { is_active }),

  // WebSocket
  connectWebSocket: (apiKey: string) => {
    const ws = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/ws`);

    ws.onopen = () => {
      console.log('[WS] Connection opened, sending auth...');
      const authMessage = JSON.stringify({ action: 'auth', api_key: apiKey });
      console.log('[WS] Sending auth message:', authMessage.substring(0, 30) + '...');
      ws.send(authMessage);
    };

    return ws;
  },
};

export default api;
