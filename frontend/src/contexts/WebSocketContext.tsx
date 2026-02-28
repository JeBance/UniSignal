import { createContext, useContext, useEffect, useRef, useCallback, useState, type ReactNode } from 'react';
import { useToast } from '../contexts/ToastContext';
import { saveSignal, signalToDB } from '../services/signals-db';

interface WebSocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: any | null;
  connect: (apiKey: string) => void;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<any | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const apiKeyRef = useRef<string>('');

  const connect = useCallback((apiKey: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    if (isConnecting) {
      console.log('WebSocket already connecting');
      return;
    }

    setIsConnecting(true);
    apiKeyRef.current = apiKey;

    // Определяем WebSocket URL на основе текущего хоста
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setIsConnecting(false);
      ws.send(JSON.stringify({ action: 'auth', api_key: apiKey }));
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message);

        if (message.status === 'authenticated') {
          console.log('✅ WebSocket authenticated');
          toast.success('✅ Подключено к WebSocket');
        } else if (message.type === 'signal') {
          const signalData = message.data || message.payload;
          if (signalData) {
            // Сохраняем в IndexedDB
            const dbSignal = signalToDB(signalData);
            await saveSignal(dbSignal);

            // Обновляем lastMessage для реактивности
            setLastMessage(signalData);

            // Показываем уведомление
            const ticker = signalData.signal?.instrument?.ticker || signalData.ticker || '';
            const direction = signalData.signal?.direction?.side?.toUpperCase() || signalData.direction || '';
            toast.success(`📡 Новый сигнал: ${direction} ${ticker}`.trim());
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;

      if (event.code === 4001 || event.code === 4002) {
        toast.error(`❌ Ошибка аутентификации: ${event.reason}`);
        return;
      }

      // Автоматическое переподключение
      if (apiKeyRef.current) {
        console.log('Reconnecting in 5 seconds...');
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect(apiKeyRef.current);
        }, 5000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast.error('⚠️ Ошибка WebSocket соединения');
    };

    wsRef.current = ws;
  }, [toast]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    apiKeyRef.current = '';
  }, []);

  // Отключаемся при размонтировании
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <WebSocketContext.Provider value={{ isConnected, isConnecting, lastMessage, connect, disconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
