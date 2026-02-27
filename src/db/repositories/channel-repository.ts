import { getPool } from '../connection';
import { logger } from '../../utils/logger';

export interface Channel {
  chat_id: number;
  name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChannelInput {
  chat_id: number;
  name: string;
  is_active?: boolean;
}

/**
 * Репозиторий для работы с каналами
 */
export class ChannelRepository {
  /**
   * Проверка наличия канала в белом списке
   * Поддерживает оба формата chat_id: оригинальный и нормализованный (-100xxxxxxxxxx)
   */
  async isActiveChannel(chatId: number): Promise<boolean> {
    try {
      // Преобразуем chat_id в строку для сравнения
      const chatIdStr = String(chatId);
      
      // Проверяем оба формата: оригинальный и нормализованный
      const result = await getPool().query<Channel>(`
        SELECT chat_id, name, is_active 
        FROM channels 
        WHERE (chat_id = $1 OR chat_id = $2 OR chat_id = $3) AND is_active = true
      `, [
        chatIdStr,
        String(Math.abs(chatId)), // Абсолютное значение (без знака -)
        String(-1000000000000 - Math.abs(chatId)) // Нормализованный формат
      ]);
      
      return result.rows.length > 0;
    } catch (err) {
      logger.error({ err, chatId }, 'Ошибка проверки канала');
      return false;
    }
  }

  /**
   * Получение всех активных каналов
   */
  async getActiveChannels(): Promise<Channel[]> {
    try {
      const result = await getPool().query<Channel>(
        'SELECT chat_id, name, is_active, created_at, updated_at FROM channels WHERE is_active = true ORDER BY name'
      );
      return result.rows;
    } catch (err) {
      logger.error({ err }, 'Ошибка получения активных каналов');
      return [];
    }
  }

  /**
   * Получение всех каналов (включая неактивные)
   */
  async getAllChannels(): Promise<Channel[]> {
    try {
      const result = await getPool().query<Channel>(
        'SELECT chat_id, name, is_active, created_at, updated_at FROM channels ORDER BY is_active DESC, name'
      );
      return result.rows;
    } catch (err) {
      logger.error({ err }, 'Ошибка получения всех каналов');
      return [];
    }
  }

  /**
   * Добавление канала
   */
  async addChannel(input: ChannelInput): Promise<Channel | null> {
    try {
      const result = await getPool().query<Channel>(
        `INSERT INTO channels (chat_id, name, is_active)
         VALUES ($1, $2, $3)
         ON CONFLICT (chat_id) DO UPDATE SET name = $2, updated_at = now()
         RETURNING chat_id, name, is_active, created_at, updated_at`,
        [input.chat_id, input.name, input.is_active ?? true]
      );
      return result.rows[0] || null;
    } catch (err) {
      logger.error({ err, input }, 'Ошибка добавления канала');
      return null;
    }
  }

  /**
   * Обновление статуса канала
   */
  async updateChannelStatus(chatId: number, isActive: boolean): Promise<boolean> {
    try {
      await getPool().query(
        'UPDATE channels SET is_active = $1, updated_at = now() WHERE chat_id = $2',
        [isActive, chatId]
      );
      return true;
    } catch (err) {
      logger.error({ err, chatId }, 'Ошибка обновления статуса канала');
      return false;
    }
  }

  /**
   * Удаление канала
   */
  async deleteChannel(chatId: number): Promise<boolean> {
    try {
      await getPool().query('DELETE FROM channels WHERE chat_id = $1', [chatId]);
      return true;
    } catch (err) {
      logger.error({ err, chatId }, 'Ошибка удаления канала');
      return false;
    }
  }
}
