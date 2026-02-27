import axios from 'axios';
import { logger } from '../utils/logger';
import { TelegrabMessage } from './telegrab-ws';

export interface LoadHistoryOptions {
  chatId: number;
  limit?: number;
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: {
    count: number;
    messages: any[];
  };
  error?: string;
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
   */
  async loadHistory(options: LoadHistoryOptions): Promise<TelegrabMessage[]> {
    const { chatId, limit } = options;

    try {
      logger.info({ 
        baseUrl: this.baseUrl,
        chatId, 
        limit: limit || 'ALL' 
      }, 'Начало загрузки истории через Telegrab API');

      // Шаг 1: Добавляем задачу в очередь
      const loadResponse = await axios.post(
        `${this.baseUrl}/load`,
        {},
        {
          params: {
            chat_id: chatId.toString(),
            limit: limit || 0, // 0 = все сообщения
          },
          headers: {
            'X-API-Key': this.apiKey,
          },
          timeout: 10000,
        }
      );

      const taskId = loadResponse.data.task_id;
      logger.info({ taskId }, 'Задача добавлена в очередь');

      // Шаг 2: Ждём завершения задачи (поллинг)
      const completed = await this.waitForTaskCompletion(taskId);
      
      if (!completed) {
        logger.warn({ taskId }, 'Таймаут ожидания задачи');
        return [];
      }

      // Шаг 3: Получаем сообщения из Telegrab
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
   * Ожидание завершения задачи
   */
  private async waitForTaskCompletion(
    taskId: string, 
    maxWaitTime = 300000, // 5 минут
    pollInterval = 5000   // 5 секунд
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get<TaskStatus>(
          `${this.baseUrl}/task/${taskId}`,
          {
            headers: {
              'X-API-Key': this.apiKey,
            },
            timeout: 5000,
          }
        );

        const status = response.data.status;
        logger.debug({ taskId, status }, 'Статус задачи');

        if (status === 'completed') {
          logger.info({ taskId }, 'Задача завершена');
          return true;
        }

        if (status === 'failed') {
          logger.error({ taskId, error: response.data.error }, 'Задача не удалась');
          return false;
        }

        // Ждём перед следующим опросом
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (err) {
        logger.warn({ taskId, err }, 'Ошибка проверки статуса задачи');
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    return false; // Таймаут
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
