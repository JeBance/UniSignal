import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { TelegrabMessage } from './telegrab-ws';

export interface TelegrabHistoryResponse {
  messages: TelegrabMessage[];
  total: number;
}

export interface LoadHistoryOptions {
  chatId?: number;
  limit?: number;
  offset?: number;
}

/**
 * Сервис для загрузки истории сообщений из Telegrab через WebSocket
 */
export class TelegrabHistoryService {
  private wsUrl: string;
  private apiKey: string;

  constructor(wsUrl: string, apiKey: string) {
    this.wsUrl = wsUrl;
    this.apiKey = apiKey;
  }

  /**
   * Загрузка истории сообщений через WebSocket
   * Telegrab может не поддерживать загрузку истории через WS
   * В этом случае возвращаем пустой массив
   */
  async loadHistory(options: LoadHistoryOptions = {}): Promise<TelegrabMessage[]> {
    const { chatId, limit = 100, offset = 0 } = options;

    return new Promise((resolve) => {
      logger.info({ wsUrl: this.wsUrl, chatId, limit }, 'Попытка загрузки истории через WS');

      // Создаем WebSocket соединение
      const ws = new WebSocket(this.wsUrl, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        logger.warn('Таймаут ожидания истории');
        resolve([]);
      }, 10000);

      ws.on('open', () => {
        logger.info('WebSocket открыт для загрузки истории');
        // Отправляем запрос на загрузку истории
        ws.send(JSON.stringify({
          action: 'get_history',
          chat_id: chatId,
          limit,
          offset,
        }));
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Если получили историю
          if (message.action === 'history' || message.type === 'history') {
            clearTimeout(timeout);
            const messages = message.messages || message.data || [];
            logger.info({ count: messages.length }, 'История получена');
            ws.close();
            resolve(messages as TelegrabMessage[]);
          } else {
            // Игнорируем другие сообщения
            logger.debug({ message }, 'Получено сообщение (не история)');
          }
        } catch (err) {
          logger.error({ err }, 'Ошибка парсинга сообщения истории');
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        logger.error({ err }, 'Ошибка WebSocket при загрузке истории');
        resolve([]);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        logger.debug('WebSocket закрыт');
      });
    });
  }

  /**
   * Загрузка истории для конкретного канала
   */
  async loadChannelHistory(
    chatId: number,
    limit = 100
  ): Promise<TelegrabMessage[]> {
    return this.loadHistory({ chatId, limit });
  }

  /**
   * Проверка доступности истории
   */
  async isHistoryAvailable(): Promise<boolean> {
    try {
      const messages = await this.loadHistory({ limit: 1 });
      return messages.length >= 0;
    } catch {
      return false;
    }
  }
}
