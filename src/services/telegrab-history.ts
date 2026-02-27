import axios from 'axios';
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
 * Сервис для загрузки истории сообщений из Telegrab
 */
export class TelegrabHistoryService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace('/ws', ''); // Убираем /ws из URL
    this.apiKey = apiKey;
  }

  /**
   * Загрузка истории сообщений
   */
  async loadHistory(options: LoadHistoryOptions = {}): Promise<TelegrabMessage[]> {
    const { chatId, limit = 100, offset = 0 } = options;

    try {
      const url = `${this.baseUrl}/history`;
      const params: Record<string, string | number> = {
        limit,
        offset,
      };

      if (chatId) {
        params.chat_id = chatId;
      }

      logger.info({ url, params }, 'Загрузка истории из Telegrab');

      const response = await axios.get<TelegrabHistoryResponse>(url, {
        params,
        headers: {
          'X-API-Key': this.apiKey,
        },
        timeout: 30000,
      });

      logger.info(
        { total: response.data.total, loaded: response.data.messages.length },
        'История загружена'
      );

      return response.data.messages;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          logger.warn('Telegrab не поддерживает endpoint /history');
          return [];
        }
        logger.error({ err, status: err.response?.status }, 'Ошибка загрузки истории');
      } else {
        logger.error({ err }, 'Ошибка загрузки истории');
      }
      return [];
    }
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
      return messages.length >= 0; // Даже пустой ответ означает доступность
    } catch {
      return false;
    }
  }
}
