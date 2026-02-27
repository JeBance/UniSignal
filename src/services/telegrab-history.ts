import axios from 'axios';
import { logger } from '../utils/logger';
import { TelegrabMessage } from './telegrab-ws';

export interface LoadHistoryOptions {
  chatId: number;
  limit?: number;
}

/**
 * Сервис для загрузки истории сообщений через HTTP API Telegrab
 */
export class TelegrabHistoryService {
  private baseUrl: string;
  private apiKey: string;

  constructor(wsUrl: string, apiKey: string) {
    // Преобразуем ws:// в http:// для HTTP API
    this.baseUrl = wsUrl.replace('/ws', '').replace('ws://', 'http://').replace('wss://', 'https://');
    this.apiKey = apiKey;
  }

  /**
   * Загрузка истории сообщений через HTTP API Telegrab
   * GET /messages - правильный эндпоинт согласно документации
   */
  async loadHistory(options: LoadHistoryOptions): Promise<TelegrabMessage[]> {
    const { chatId, limit } = options;

    try {
      logger.info({
        baseUrl: this.baseUrl,
        chatId,
        limit: limit || 'ALL'
      }, 'Начало загрузки истории через Telegrab API');

      // Загружаем сообщения напрямую через GET /messages
      const messagesResponse = await axios.get(
        `${this.baseUrl}/messages`,
        {
          params: {
            chat_id: chatId,
            limit: limit || 10000,
          },
          headers: {
            'X-API-Key': this.apiKey,
          },
          timeout: 30000,
        }
      );

      const messages: TelegrabMessage[] = messagesResponse.data.messages?.map((msg: any) => ({
        message_id: msg.message_id,
        chat_id: msg.chat_id,
        chat_title: msg.chat_title || 'Unknown',
        text: msg.text || '',
        sender_name: msg.sender_name || null,
        message_date: msg.message_date || msg.date,
      })) || [];

      logger.info({ loaded: messages.length }, 'История загружена');
      return messages;

    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        logger.error({ 
          err, 
          status: err.response?.status, 
          data: err.response?.data 
        }, 'Ошибка загрузки истории');
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
    limit?: number
  ): Promise<TelegrabMessage[]> {
    return this.loadHistory({ chatId, limit });
  }

  /**
   * Проверка доступности API
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/`,
        { timeout: 5000 }
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
