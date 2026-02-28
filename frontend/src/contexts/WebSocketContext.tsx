import { createContext, useContext, useEffect, useRef, useCallback, useState, type ReactNode } from 'react';
import { useToast } from '../contexts/ToastContext';
import { saveSignal, signalToDB } from '../services/signals-db';

interface WebSocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: any | null;
  connect: (apiKey: string) => void;
  disconnect: () => void;
  setOnSignalClick: (callback: ((signal: any) => void) | undefined) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<any | null>(null);
  const onSignalClickRef = useRef<((signal: any) => void) | undefined>(undefined);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const apiKeyRef = useRef<string>('');
  const shownSignalIdsRef = useRef<Set<number>>(new Set());

  const setOnSignalClick = (callback: ((signal: any) => void) | undefined) => {
    onSignalClickRef.current = callback;
  };

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
        console.log('WebSocket message:', message);

        if (message.status === 'authenticated') {
          console.log('✅ WebSocket authenticated');
          toast.success('✅ Подключено к WebSocket');
        } else if (message.type === 'signal') {
          // Обрабатываем два формата сообщений
          const signalData = message.data || message.payload;
          const isPayloadFormat = !!message.payload;

          if (signalData) {
            const signalId = signalData.id;
            
            // Проверяем, не показывали ли уже этот сигнал
            if (signalId && shownSignalIdsRef.current.has(signalId)) {
              console.log('Signal already shown, skipping:', signalId);
              return;
            }
            
            // Если это payload формат (TradingSignal от broadcastSignal), извлекаем данные правильно
            let formattedSignal: any;
            if (isPayloadFormat && signalData.signal_id) {
              // Формат от broadcastSignal: TradingSignal
              formattedSignal = {
                id: signalData.signal_id,
                channel: signalData.source?.channel || 'Unknown',
                direction: signalData.signal?.direction?.side?.toUpperCase() || null,
                ticker: signalData.signal?.instrument?.ticker || null,
                entryPrice: signalData.signal?.trade_setup?.entry_price || null,
                stopLoss: signalData.signal?.trade_setup?.stop_loss?.stop_0_5 || null,
                takeProfit: signalData.signal?.trade_setup?.targets?.[0] || null,
                text: signalData.source?.original_text || '',
                timestamp: signalData.timestamp ? 
                  (typeof signalData.timestamp === 'string' ? Math.floor(new Date(signalData.timestamp).getTime() / 1000) : signalData.timestamp) 
                  : Math.floor(Date.now() / 1000),
                parsedSignal: signalData,
              };
            } else {
              // Формат от broadcast: ProcessedMessage data
              formattedSignal = {
                id: signalData.id,
                channel: signalData.channel || signalData.channel_name,
                direction: signalData.direction,
                ticker: signalData.ticker,
                entryPrice: signalData.entry_price || signalData.entryPrice,
                stopLoss: signalData.stop_loss || signalData.stopLoss,
                takeProfit: signalData.take_profit || signalData.takeProfit,
                text: signalData.content_text || signalData.text,
                timestamp: signalData.timestamp,
                // parsed_signal может быть в snake_case или camelCase
                parsedSignal: signalData.parsed_signal || signalData.parsedSignal,
              };
            }
            
            // Проверяем наличие валидного id перед сохранением
            if (!formattedSignal.id) {
              console.error('Signal without id, skipping:', signalData);
              return;
            }

            // Сохраняем в IndexedDB
            const dbSignal = signalToDB(formattedSignal);
            await saveSignal(dbSignal);

            // Обновляем lastMessage для реактивности
            console.log('Setting lastMessage with parsedSignal:', !!formattedSignal.parsedSignal);
            if (formattedSignal.parsedSignal) {
              console.log('parsedSignal structure:', JSON.stringify({
                type: formattedSignal.parsedSignal.signal?.type,
                ticker: formattedSignal.parsedSignal.signal?.instrument?.ticker,
                direction: formattedSignal.parsedSignal.signal?.direction?.side,
              }, null, 2));
            }
            setLastMessage(formattedSignal);
            
            // Добавляем ID в множество показанных
            if (signalId) {
              shownSignalIdsRef.current.add(signalId);
            }

            // Показываем уведомление с возможностью клика
            const ticker = formattedSignal.parsedSignal?.signal?.instrument?.ticker || formattedSignal.ticker || '';
            const direction = formattedSignal.parsedSignal?.signal?.direction?.side?.toUpperCase() || formattedSignal.direction || '';
            const messageText = `📡 Новый сигнал: ${direction} ${ticker}`.trim();

            console.log('Showing toast notification, onSignalClick:', !!onSignalClickRef.current);
            toast.success(messageText, {
              onClick: () => {
                console.log('Toast clicked, calling onSignalClick...');
                if (onSignalClickRef.current) {
                  console.log('Calling onSignalClick with signal:', formattedSignal.id);
                  onSignalClickRef.current(formattedSignal);
                } else {
                  console.warn('onSignalClick is not set!');
                }
              },
              style: { cursor: 'pointer' }
            });
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
    <WebSocketContext.Provider value={{ isConnected, isConnecting, lastMessage, connect, disconnect, setOnSignalClick }}>
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
