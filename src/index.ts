import { config } from 'dotenv';
import { logger } from './utils/logger';
import { initDatabase, closeDatabase, checkDatabaseConnection } from './db/connection';
import { TelegrabWsClient, TelegrabEvent } from './services/telegrab-ws';
import { ChannelRepository } from './db/repositories/channel-repository';
import { MessageRepository } from './db/repositories/message-repository';
import { MessageProcessor } from './services/message-processor';
import { AdminApi } from './services/admin-api';
import { ClientWsServer } from './services/client-ws';
import { ClientRepository } from './db/repositories/client-repository';
import { TradingSignal } from './services/signal-parser';

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

  // Инициализация репозиториев
  const channelRepo = new ChannelRepository();
  const messageRepo = new MessageRepository();
  const clientRepo = new ClientRepository();
  
  // Создание парсера сигналов
  const messageProcessor = new MessageProcessor(channelRepo, messageRepo, {
    broadcastToClients: true, // Транслировать новые сообщения
    onMessageProcessed: (processed) => {
      // Трансляция клиентам через WebSocket
      if (clientWsServer) {
        clientWsServer.broadcast(processed);
      }
    },
    onSignalParsed: (signal: TradingSignal) => {
      // Отправка распарсенного сигнала клиентам
      if (clientWsServer) {
        clientWsServer.broadcastSignal(signal);
      }
    },
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
            signalType: processed.parsedSignal?.signal.type,
          },
          '✅ Сообщение обработано'
        );
        // Трансляция выполняется в onMessageProcessed callback
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

  // Инициализация Admin HTTP API
  const adminMasterKey = process.env.ADMIN_MASTER_KEY;
  const port = parseInt(process.env.PORT || '8080', 10);

  if (!adminMasterKey) {
    logger.error('ADMIN_MASTER_KEY не указан');
    process.exit(1);
  }

  const adminApi = new AdminApi({
    adminMasterKey,
    port,
  });

  const httpServer = adminApi.start();

  // Инициализация Client WebSocket сервера (интегрируется с HTTP сервером)
  const clientWsServer = new ClientWsServer(
    {
      httpServer,
      path: '/ws',
      authTimeout: 30000, // 30 секунд на аутентификацию
    },
    clientRepo
  );

  // Периодический сброс буфера (каждые 30 секунд)
  const bufferFlushInterval = setInterval(async () => {
    const bufferSize = messageProcessor.getBufferSize();
    if (bufferSize > 0) {
      logger.info({ bufferSize }, 'Попытка сброса буфера...');
      await messageProcessor.flushBuffer();
    }
  }, 30000);

  // Периодический лог статистики (каждые 60 секунд)
  const statsInterval = setInterval(() => {
    const clientCount = clientWsServer.getClientCount();
    const bufferSize = messageProcessor.getBufferSize();
    logger.info(
      { clients: clientCount, buffer: bufferSize },
      '📊 Статистика'
    );
  }, 60000);

  logger.info(`📡 Порт: ${port}`);
  logger.info('🔌 Подключение к Telegrab WS установлено');
  logger.info('🌐 Admin HTTP API запущен');
  logger.info('🔗 Client WS сервер запущен (путь: /ws)');

  // Обработка сигналов завершения
  process.on('SIGINT', async () => {
    logger.info('Получен сигнал SIGINT, завершение работы...');
    clearInterval(bufferFlushInterval);
    clearInterval(statsInterval);
    
    telegrabClient.close();
    clientWsServer.close();
    
    // Финальный сброс буфера
    await messageProcessor.flushBuffer();
    
    await closeDatabase();
    
    logger.info('✅ Завершение работы успешно');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Получен сигнал SIGTERM, завершение работы...');
    clearInterval(bufferFlushInterval);
    clearInterval(statsInterval);
    
    telegrabClient.close();
    clientWsServer.close();
    
    // Финальный сброс буфера
    await messageProcessor.flushBuffer();
    
    await closeDatabase();
    
    logger.info('✅ Завершение работы успешно');
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Критическая ошибка при запуске приложения');
  process.exit(1);
});
