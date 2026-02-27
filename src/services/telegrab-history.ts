import axios from 'axios';
import { logger } from '../utils/logger';
import { TelegrabMessage } from './telegrab-ws';

export interface LoadHistoryOptions {
  chatId: number | string;
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
   *
   * При limit = 0 загружаются все сообщения (без ограничений)
   * Telegrab API может возвращать данные с пагинацией, поэтому
   * для больших объёмов нужно использовать несколько запросов
   */
  async loadHistory(options: LoadHistoryOptions): Promise<TelegrabMessage[]> {
    let { chatId, limit } = options;
    const allMessages: TelegrabMessage[] = [];
    let offset = 0;
    const batchSize = 10000; // Максимальный размер батча для Telegrab API

    // Преобразуем нормализованный chat_id обратно в оригинальный для Telegrab API
    // chat_id может быть строкой (bigint из PostgreSQL) или числом
    let numericChatId: number;
    if (typeof chatId === 'string') {
      numericChatId = parseInt(chatId, 10);
    } else {
      numericChatId = Math.round(chatId);
    }

    // Если chat_id начинается с -100, извлекаем оригинальный ID
    // Используем BigInt для работы с большими числами
    if (numericChatId < -1000000000000) {
      numericChatId = Number(BigInt(numericChatId) + 1000000000000n);
    }

    // Обновляем chatId для использования в запросе
    chatId = numericChatId;

    // Если limit = 0, загружаем всё (без ограничений)
    // Иначе используем указанный лимит
    const loadAll = (limit === 0 || limit === undefined);

    try {
      logger.info({
        baseUrl: this.baseUrl,
        chatId,
        limit: loadAll ? 'ALL (без ограничений)' : limit
      }, 'Начало загрузки истории через Telegrab API');

      // Циклически загружаем сообщения батчами
      while (loadAll || allMessages.length < limit!) {
        const currentLimit = loadAll 
          ? batchSize 
          : Math.min(batchSize, limit! - allMessages.length);
        
        const messagesResponse = await axios.get(
          `${this.baseUrl}/messages`,
          {
            params: {
              chat_id: chatId,
              limit: currentLimit,
              offset: offset, // Поддержка пагинации
            },
            headers: {
              'X-API-Key': this.apiKey,
            },
            timeout: 60000, // Увеличенный таймаут для больших батчей
          }
        );

        const batch: TelegrabMessage[] = messagesResponse.data.messages?.map((msg: any) => ({
          message_id: msg.message_id,
          chat_id: msg.chat_id,
          chat_title: msg.chat_title || 'Unknown',
          text: msg.text || '',
          sender_name: msg.sender_name || null,
          message_date: msg.message_date || msg.date,
        })) || [];

        if (batch.length === 0) {
          // Больше нет сообщений
          break;
        }

        allMessages.push(...batch);
        offset += batch.length;

        logger.info({
          loaded: allMessages.length,
          batch: batch.length,
          offset
        }, `Загружено сообщений (всего: ${allMessages.length})`);

        // Если получили меньше чем запросили, значит это последний батч
        if (batch.length < currentLimit) {
          break;
        }
      }

      logger.info({ total: allMessages.length }, 'История загружена');
      return allMessages;

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
