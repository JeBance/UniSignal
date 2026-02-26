import { config } from 'dotenv';
import { logger } from './utils/logger';
import { initDatabase, closeDatabase, checkDatabaseConnection } from './db/connection';
import { TelegrabWsClient, TelegrabEvent } from './services/telegrab-ws';
import { ChannelRepository } from './db/repositories/channel-repository';
import { MessageRepository } from './db/repositories/message-repository';
import { MessageProcessor } from './services/message-processor';
import { createSignalParser } from './services/parser';

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

  // Инициализация репозиториев и процессора
  const channelRepo = new ChannelRepository();
  const messageRepo = new MessageRepository();
  
  // Создание парсера сигналов
  const parseSignal = createSignalParser();

  const messageProcessor = new MessageProcessor(channelRepo, messageRepo, {
    parseSignal,
  });

  // Инициализация Telegrab WS клиента
  const telegrabWsUrl = process.env.TELEGRAB_WS_URL;
  const telegrabApiKey = process.env.TELEGRAB_API_KEY;

  if (!telegrabWsUrl || !telegrabApiKey) {
    logger.error('TELEGRAB_WS_URL или TELEGRAB_API_KEY не указаны');
    process.exit(1);
  }

  // Обработчик событий от Telegrab
  const handleTelegrabEvent = async (event: TelegrabEvent) => {
    logger.info({ type: event.type }, '📨 Событие от Telegrab');
    
    if (event.type === 'new_message' && event.message) {
      const msg = event.message;
      logger.info(
        { 
          chat_id: msg.chat_id, 
          chat_title: msg.chat_title,
          message_id: msg.message_id,
        },
        `Новое сообщение: "${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"`
      );
      
      // Обработка сообщения: фильтрация, нормализация, сохранение
      const processed = await messageProcessor.processMessage(msg);
      
      if (processed) {
        logger.info(
          { 
            id: processed.id, 
            channel: processed.channel_name,
            ticker: processed.ticker,
            direction: processed.direction,
            entryPrice: processed.entry_price,
            stopLoss: processed.stop_loss,
            takeProfit: processed.take_profit,
          },
          '✅ Сообщение обработано'
        );
        
        // TODO: Этап 6 - отправка клиентам через WebSocket
      }
    } else if (event.type === 'message_edited') {
      logger.debug({ event }, 'Сообщение отредактировано (игнорируем)');
    } else if (event.type === 'messages_deleted') {
      logger.debug({ event }, 'Сообщения удалены (игнорируем)');
    }
  };

  const telegrabClient = new TelegrabWsClient(
    telegrabWsUrl,
    telegrabApiKey,
    handleTelegrabEvent
  );

  // Подключение к Telegrab
  telegrabClient.connect();

  // Периодический сброс буфера (каждые 30 секунд)
  const bufferFlushInterval = setInterval(async () => {
    const bufferSize = messageProcessor.getBufferSize();
    if (bufferSize > 0) {
      logger.info({ bufferSize }, 'Попытка сброса буфера...');
      await messageProcessor.flushBuffer();
    }
  }, 30000);

  logger.info(`📡 Сервер слушает порт ${process.env.PORT || 8080}`);
  logger.info('🔌 Подключение к Telegrab WS установлено');

  // Обработка сигналов завершения
  process.on('SIGINT', async () => {
    logger.info('Получен сигнал SIGINT, завершение работы...');
    clearInterval(bufferFlushInterval);
    telegrabClient.close();
    
    // Финальный сброс буфера
    await messageProcessor.flushBuffer();
    
    await closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Получен сигнал SIGTERM, завершение работы...');
    clearInterval(bufferFlushInterval);
    telegrabClient.close();
    
    // Финальный сброс буфера
    await messageProcessor.flushBuffer();
    
    await closeDatabase();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Критическая ошибка при запуске приложения');
  process.exit(1);
});
