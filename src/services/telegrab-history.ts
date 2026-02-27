import sqlite3 from 'sqlite3';
import { logger } from '../utils/logger';
import { TelegrabMessage } from './telegrab-ws';

export interface LoadHistoryOptions {
  chatId: number;
  limit?: number;
  offset?: number;
}

/**
 * Сервис для загрузки истории сообщений из SQLite базы Telegrab
 */
export class TelegrabHistoryService {
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Загрузка истории сообщений из SQLite
   */
  async loadHistory(options: LoadHistoryOptions): Promise<TelegrabMessage[]> {
    const { chatId, limit = 100, offset = 0 } = options;

    return new Promise((resolve, reject) => {
      logger.info({ dbPath: this.dbPath, chatId, limit }, 'Загрузка истории из SQLite');

      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          logger.error({ err }, 'Ошибка подключения к SQLite');
          resolve([]);
          return;
        }

        const query = `
          SELECT chat_id, message_id, raw_data, saved_at
          FROM messages_raw
          WHERE chat_id = ?
          ORDER BY message_id DESC
          LIMIT ? OFFSET ?
        `;

        db.all(query, [chatId, limit, offset], (err, rows) => {
          if (err) {
            logger.error({ err }, 'Ошибка загрузки истории');
            db.close();
            resolve([]);
            return;
          }

          const messages: TelegrabMessage[] = rows.map((row: any) => {
            try {
              const rawData = JSON.parse(row.raw_data);
              return {
                message_id: row.message_id,
                chat_id: row.chat_id,
                chat_title: rawData.chat_title || 'Unknown',
                text: rawData.text || '',
                sender_name: rawData.sender_name || null,
                message_date: rawData.date || row.saved_at,
              };
            } catch (parseErr) {
              logger.warn({ err: parseErr, messageId: row.message_id }, 'Ошибка парсинга raw_data');
              return null;
            }
          }).filter((m): m is TelegrabMessage => m !== null);

          logger.info({ loaded: messages.length }, 'История загружена');
          db.close();
          resolve(messages);
        });
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
   * Проверка доступности базы данных
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          resolve(false);
          return;
        }
        db.close();
        resolve(true);
      });
    });
  }
}
