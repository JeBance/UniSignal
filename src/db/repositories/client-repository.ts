import { getPool } from '../connection';
import { logger } from '../../utils/logger';
import { randomBytes } from 'crypto';

export interface Client {
  id: string;
  api_key: string;
  is_active: boolean;
  created_at: Date;
}

export interface ClientInput {
  is_active?: boolean;
}

/**
 * Репозиторий для работы с клиентами
 */
export class ClientRepository {
  /**
   * Генерация безопасного API ключа
   */
  generateApiKey(): string {
    return 'usk_' + randomBytes(24).toString('hex');
  }

  /**
   * Создание нового клиента
   */
  async create(input: ClientInput = {}): Promise<Client | null> {
    try {
      const apiKey = this.generateApiKey();
      const result = await getPool().query<Client>(
        `INSERT INTO clients (api_key, is_active)
         VALUES ($1, $2)
         RETURNING id, api_key, is_active, created_at`,
        [apiKey, input.is_active ?? true]
      );
      return result.rows[0] || null;
    } catch (err) {
      logger.error({ err }, 'Ошибка создания клиента');
      return null;
    }
  }

  /**
   * Получение клиента по API ключу
   */
  async getByApiKey(apiKey: string): Promise<Client | null> {
    try {
      const result = await getPool().query<Client>(
        'SELECT id, api_key, is_active, created_at FROM clients WHERE api_key = $1 AND is_active = true LIMIT 1',
        [apiKey]
      );
      return result.rows[0] || null;
    } catch (err) {
      logger.error({ err }, 'Ошибка получения клиента по ключу');
      return null;
    }
  }

  /**
   * Получение всех клиентов
   */
  async getAll(): Promise<Client[]> {
    try {
      const result = await getPool().query<Client>(
        'SELECT id, api_key, is_active, created_at FROM clients ORDER BY created_at DESC'
      );
      return result.rows;
    } catch (err) {
      logger.error({ err }, 'Ошибка получения всех клиентов');
      return [];
    }
  }

  /**
   * Обновление статуса клиента
   */
  async updateStatus(id: string, isActive: boolean): Promise<boolean> {
    try {
      await getPool().query(
        'UPDATE clients SET is_active = $1 WHERE id = $2',
        [isActive, id]
      );
      return true;
    } catch (err) {
      logger.error({ err, id }, 'Ошибка обновления статуса клиента');
      return false;
    }
  }

  /**
   * Удаление клиента
   */
  async delete(id: string): Promise<boolean> {
    try {
      await getPool().query('DELETE FROM clients WHERE id = $1', [id]);
      return true;
    } catch (err) {
      logger.error({ err, id }, 'Ошибка удаления клиента');
      return false;
    }
  }

  /**
   * Проверка активности клиента
   */
  async isActive(id: string): Promise<boolean> {
    try {
      const result = await getPool().query(
        'SELECT 1 FROM clients WHERE id = $1 AND is_active = true LIMIT 1',
        [id]
      );
      return result.rows.length > 0;
    } catch (err) {
      logger.error({ err, id }, 'Ошибка проверки активности клиента');
      return false;
    }
  }
}
