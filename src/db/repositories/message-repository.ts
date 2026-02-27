import { getPool } from '../connection';
import { logger } from '../../utils/logger';

export interface Message {
  id: number;
  unique_hash: string;
  channel_id: number;
  direction: string | null;
  ticker: string | null;
  entry_price: string | null;
  stop_loss: string | null;
  take_profit: string | null;
  content_text: string;
  original_timestamp: Date;
  created_at: Date;
  parsed_signal?: Record<string, unknown> | null;
}

export interface MessageInput {
  unique_hash: string;
  channel_id: number;
  direction?: string | null;
  ticker?: string | null;
  entry_price?: number | string | null;
  stop_loss?: number | string | null;
  take_profit?: number | string | null;
  content_text: string;
  original_timestamp: Date | string;
  parsed_signal?: Record<string, unknown> | null;
}

/**
 * Репозиторий для работы с сообщениями
 */
export class MessageRepository {
  /**
   * Проверка наличия сообщения по unique_hash
   */
  async exists(uniqueHash: string): Promise<boolean> {
    try {
      const result = await getPool().query(
        'SELECT 1 FROM messages WHERE unique_hash = $1 LIMIT 1',
        [uniqueHash]
      );
      return result.rows.length > 0;
    } catch (err) {
      logger.error({ err, uniqueHash }, 'Ошибка проверки дедупликации');
      return false;
    }
  }

  /**
   * Сохранение сообщения (с дедупликацией)
   * Возвращает null если дубликат
   */
  async save(input: MessageInput): Promise<Message | null> {
    try {
      const result = await getPool().query<Message>(
        `INSERT INTO messages (
          unique_hash, channel_id, direction, ticker,
          entry_price, stop_loss, take_profit,
          content_text, original_timestamp, parsed_signal
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (unique_hash) DO NOTHING
        RETURNING id, unique_hash, channel_id, direction, ticker,
                  entry_price, stop_loss, take_profit,
                  content_text, original_timestamp, created_at, parsed_signal`,
        [
          input.unique_hash,
          input.channel_id,
          input.direction ?? null,
          input.ticker ?? null,
          input.entry_price ?? null,
          input.stop_loss ?? null,
          input.take_profit ?? null,
          input.content_text,
          input.original_timestamp,
          input.parsed_signal ?? null,
        ]
      );

      if (result.rows.length === 0) {
        // Дубликат
        return null;
      }
      
      return result.rows[0];
    } catch (err) {
      logger.error({ err, input }, 'Ошибка сохранения сообщения');
      throw err;
    }
  }

  /**
   * Получение сообщения по ID
   */
  async getById(id: number): Promise<Message | null> {
    try {
      const result = await getPool().query<Message>(
        'SELECT * FROM messages WHERE id = $1 LIMIT 1',
        [id]
      );
      return result.rows[0] || null;
    } catch (err) {
      logger.error({ err, id }, 'Ошибка получения сообщения');
      return null;
    }
  }

  /**
   * Получение последних сообщений
   */
  async getRecent(limit: number = 50): Promise<Message[]> {
    try {
      const result = await getPool().query<Message>(
        'SELECT * FROM messages ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
      return result.rows;
    } catch (err) {
      logger.error({ err }, 'Ошибка получения последних сообщений');
      return [];
    }
  }

  /**
   * Получение сообщений по каналу
   */
  async getByChannel(channelId: number, limit: number = 50): Promise<Message[]> {
    try {
      const result = await getPool().query<Message>(
        'SELECT * FROM messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT $2',
        [channelId, limit]
      );
      return result.rows;
    } catch (err) {
      logger.error({ err, channelId }, 'Ошибка получения сообщений канала');
      return [];
    }
  }

  /**
   * Статистика сообщений
   */
  async getStats(): Promise<{
    total: number;
    today: number;
    with_ticker: number;
    long_count: number;
    short_count: number;
  } | null> {
    try {
      const result = await getPool().query<{
        total: string;
        today: string;
        with_ticker: string;
        long_count: string;
        short_count: string;
      }>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE original_timestamp >= now() - interval '1 day') as today,
          COUNT(*) FILTER (
            WHERE ticker IS NOT NULL 
            OR (parsed_signal->'signal'->'instrument'->>'ticker') IS NOT NULL
          ) as with_ticker,
          COUNT(*) FILTER (
            WHERE direction = 'LONG' 
            OR (parsed_signal->'signal'->'direction'->>'side') = 'long'
          ) as long_count,
          COUNT(*) FILTER (
            WHERE direction = 'SHORT' 
            OR (parsed_signal->'signal'->'direction'->>'side') = 'short'
          ) as short_count
        FROM messages
      `);

      const row = result.rows[0];
      if (!row) return null;

      return {
        total: parseInt(row.total, 10),
        today: parseInt(row.today, 10),
        with_ticker: parseInt(row.with_ticker, 10),
        long_count: parseInt(row.long_count, 10),
        short_count: parseInt(row.short_count, 10),
      };
    } catch (err) {
      logger.error({ err }, 'Ошибка получения статистики');
      return null;
    }
  }
}
