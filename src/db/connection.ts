import { Pool } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

/**
 * Инициализация подключения к базе данных
 */
export function initDatabase(connectionString: string): Pool {
  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Неожиданная ошибка пула соединений PostgreSQL');
  });

  logger.info('Подключение к базе данных инициализировано');
  return pool;
}

/**
 * Получение пула соединений
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('База данных не инициализирована. Вызовите initDatabase() первым.');
  }
  return pool;
}

/**
 * Проверка подключения к БД
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (err) {
    logger.error({ err }, 'Ошибка проверки подключения к базе данных');
    return false;
  }
}

/**
 * Закрытие подключения к базе данных
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Подключение к базе данных закрыто');
  }
}
