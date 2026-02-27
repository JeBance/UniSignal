import WebSocket from 'ws';
import { logger } from '../utils/logger';

export interface TelegrabMessage {
  message_id: number;
  chat_id: number;
  chat_title: string;
  text: string;
  sender_name: string | null;
  message_date: string;
  has_media?: boolean;
  files?: Array<{
    file_id: string;
    file_type: string;
    file_name?: string;
    file_size?: number;
  }>;
}

export interface TelegrabEvent {
  type: 'new_message' | 'message_edited' | 'messages_deleted';
  message?: TelegrabMessage;
  messages?: number[];
}

export type TelegrabEventHandler = (event: TelegrabEvent) => Promise<void>;

/**
 * WS-клиент для подключения к Telegrab
 */
export class TelegrabWsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private apiKey: string;
  private reconnectDelay: number = 1000; // Начальная задержка 1 секунда
  private maxReconnectDelay: number = 60000; // Максимум 60 секунд
  private handler: TelegrabEventHandler;
  private isManualClose: boolean = false;

  constructor(url: string, apiKey: string, handler: TelegrabEventHandler) {
    this.url = url;
    this.apiKey = apiKey;
    this.handler = handler;
  }

  /**
   * Подключение к Telegrab WebSocket
   */
  public connect(): void {
    if (this.isManualClose) {
      logger.info('Ручное закрытие соединения, не подключаюсь');
      return;
    }

    try {
      logger.info(`Подключение к Telegrab WS: ${this.url}`);
      
      this.ws = new WebSocket(this.url, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        logger.info('✅ Подключение к Telegrab WebSocket успешно');
        this.reconnectDelay = 1000; // Сброс задержки при успешном подключении
      });

      this.ws.on('message', async (data: WebSocket.Data) => {
        try {
          const event = JSON.parse(data.toString()) as TelegrabEvent;
          logger.debug({ event }, 'Получено событие от Telegrab');
          
          await this.handler(event);
        } catch (err) {
          logger.error({ err, data: data.toString() }, 'Ошибка обработки сообщения от Telegrab');
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        logger.info(`Соединение закрыто: code=${code}, reason=${reason.toString()}`);
        this.ws = null;
        
        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err: Error) => {
        logger.error({ err }, 'Ошибка WebSocket соединения');
      });

      this.ws.on('ping', () => {
        logger.debug('Получен ping от сервера');
      });
    } catch (err) {
      logger.error({ err }, 'Ошибка создания WebSocket соединения');
      this.scheduleReconnect();
    }
  }

  /**
   * Переподключение с экспоненциальной задержкой
   */
  private scheduleReconnect(): void {
    if (this.isManualClose) {
      return;
    }

    logger.info(`Переподключение через ${this.reconnectDelay / 1000} сек...`);
    
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Экспоненциальное увеличение задержки
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  /**
   * Закрытие соединения
   */
  public close(): void {
    this.isManualClose = true;
    
    if (this.ws) {
      logger.info('Закрытие соединения с Telegrab...');
      this.ws.close(1000, 'Manual close');
      this.ws = null;
    }
  }

  /**
   * Проверка статуса подключения
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
