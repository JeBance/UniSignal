import { config } from 'dotenv';
import { logger } from './utils/logger';
import { initDatabase, closeDatabase, checkDatabaseConnection } from './db/connection';

// Загрузка переменных окружения
config();

async function main() {
  logger.info('🚀 Запуск UniSignal Relay...');

  // Инициализация базы данных
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.error('DATABASE_URL не указан в переменных окружения');
    process.exit(1);
  }

  initDatabase(databaseUrl);

  // Проверка подключения к БД
  const isConnected = await checkDatabaseConnection();
  if (!isConnected) {
    logger.error('Не удалось подключиться к базе данных');
    process.exit(1);
  }

  logger.info('✅ Подключение к базе данных успешно');

  // TODO: Инициализация остальных сервисов
  // - Telegrab WS клиент
  // - Admin HTTP API
  // - Client WS сервер

  logger.info(`📡 Сервер слушает порт ${process.env.PORT || 8080}`);

  // Обработка сигналов завершения
  process.on('SIGINT', async () => {
    logger.info('Получен сигнал SIGINT, завершение работы...');
    await closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Получен сигнал SIGTERM, завершение работы...');
    await closeDatabase();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Критическая ошибка при запуске приложения');
  process.exit(1);
});
