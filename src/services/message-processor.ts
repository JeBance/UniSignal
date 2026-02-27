import { ChannelRepository } from '../db/repositories/channel-repository';
import { MessageRepository } from '../db/repositories/message-repository';
import { MessageBuffer } from './buffer';
import { TelegrabMessage } from './telegrab-ws';
import { logger } from '../utils/logger';

export interface ProcessedMessage {
  id: number;
  unique_hash: string;
  channel_id: number;
  channel_name: string;
  direction: string | null;
  ticker: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  content_text: string;
  original_timestamp: Date;
}

export interface MessageProcessorConfig {
  parseSignal?: (text: string) => SignalData;
  broadcastToClients?: boolean; // Транслировать ли сообщения клиентам
  onMessageProcessed?: (message: ProcessedMessage) => void; // Callback для новых сообщений
}

export interface SignalData {
  direction: 'LONG' | 'SHORT' | null;
  ticker: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}

/**
 * Основной процессор сообщений
 * Отвечает за: фильтрацию, нормализацию, дедупликацию, сохранение
 */
export class MessageProcessor {
  private channelRepo: ChannelRepository;
  private messageRepo: MessageRepository;
  private buffer: MessageBuffer;
  private config: MessageProcessorConfig;

  constructor(
    channelRepo: ChannelRepository,
    messageRepo: MessageRepository,
    config: MessageProcessorConfig = {}
  ) {
    this.channelRepo = channelRepo;
    this.messageRepo = messageRepo;
    this.buffer = new MessageBuffer();
    this.config = config;
  }

  /**
   * Обработка сообщения от Telegrab
   */
  async processMessage(message: TelegrabMessage): Promise<ProcessedMessage | null> {
    let { chat_id, chat_title, message_id, text, message_date } = message;

    // Нормализация chat_id: Telegram использует разные форматы ID
    // -100xxxxxxxxx для супергрупп (каналы)
    // Telegrab может возвращать положительные ID без -100 префикса
    let normalizedChatId = chat_id;
    
    if (chat_id > 0) {
      // Положительный ID - добавляем -100 префикс для супергрупп
      normalizedChatId = -1000000000000 - chat_id;
    } else if (chat_id < 0 && String(chat_id).length < 13) {
      // Отрицательный, но без -100 префикса (короткий ID)
      normalizedChatId = -1000000000000 - Math.abs(chat_id);
    }
    // Иначе уже правильный формат -100xxxxxxxxx (13+ цифр)

    // 1. Фильтрация по каналу
    const isChannelActive = await this.channelRepo.isActiveChannel(normalizedChatId);
    if (!isChannelActive) {
      logger.debug(
        { chat_id, normalizedChatId, chat_title },
        'Канал не в белом списке, сообщение пропущено'
      );
      return null;
    }

    // 2. Формирование unique_hash для дедупликации
    const uniqueHash = `${normalizedChatId}_${message_id}`;

    // 3. Проверка на дубликат
    const isDuplicate = await this.messageRepo.exists(uniqueHash);
    if (isDuplicate) {
      logger.debug({ uniqueHash }, 'Сообщение уже существует (дубликат)');
      return null;
    }

    // 4. Нормализация (парсинг сигнала)
    const signalData = this.config.parseSignal
      ? this.config.parseSignal(text)
      : {
          direction: null,
          ticker: null,
          entry_price: null,
          stop_loss: null,
          take_profit: null,
        };

    // 5. Сохранение в БД
    try {
      const savedMessage = await this.messageRepo.save({
        unique_hash: uniqueHash,
        channel_id: normalizedChatId,
        direction: signalData.direction,
        ticker: signalData.ticker,
        entry_price: signalData.entry_price,
        stop_loss: signalData.stop_loss,
        take_profit: signalData.take_profit,
        content_text: text,
        original_timestamp: new Date(message_date),
      });

      if (!savedMessage) {
        // Дубликат (конфликт при вставке)
        logger.debug({ uniqueHash }, 'Дубликат обнаружен при вставке');
        return null;
      }

      logger.info(
        {
          id: savedMessage.id,
          channel: chat_title,
          ticker: signalData.ticker,
          direction: signalData.direction,
        },
        '✅ Сообщение сохранено'
      );

      const processedMessage: ProcessedMessage = {
        id: savedMessage.id,
        unique_hash: savedMessage.unique_hash,
        channel_id: savedMessage.channel_id,
        channel_name: chat_title,
        direction: savedMessage.direction,
        ticker: savedMessage.ticker,
        entry_price: savedMessage.entry_price
          ? parseFloat(savedMessage.entry_price)
          : null,
        stop_loss: savedMessage.stop_loss
          ? parseFloat(savedMessage.stop_loss)
          : null,
        take_profit: savedMessage.take_profit
          ? parseFloat(savedMessage.take_profit)
          : null,
        content_text: savedMessage.content_text,
        original_timestamp: savedMessage.original_timestamp,
      };

      // Транслируем клиентам только если включено
      if (this.config.broadcastToClients !== false && this.config.onMessageProcessed) {
        this.config.onMessageProcessed(processedMessage);
      }

      return processedMessage;
    } catch (err: unknown) {
      // Ошибка БД - буферизуем сообщение
      logger.error({ err, message }, 'Ошибка сохранения, добавляем в буфер');
      
      this.buffer.add({
        message,
        signalData,
        uniqueHash,
      });

      // Пробуем сбросить буфер
      await this.flushBuffer();

      return null;
    }
  }

  /**
   * Сброс буфера в БД
   */
  async flushBuffer(): Promise<number> {
    if (this.buffer.isEmpty() || this.buffer.getIsFlushing()) {
      return 0;
    }

    this.buffer.setIsFlushing(true);
    let processedCount = 0;

    try {
      const messages = this.buffer.getAll();

      for (const item of messages) {
        const { message, signalData, uniqueHash } = item.data as {
          message: TelegrabMessage;
          signalData: SignalData;
          uniqueHash: string;
        };

        try {
          const savedMessage = await this.messageRepo.save({
            unique_hash: uniqueHash,
            channel_id: message.chat_id,
            direction: signalData.direction,
            ticker: signalData.ticker,
            entry_price: signalData.entry_price,
            stop_loss: signalData.stop_loss,
            take_profit: signalData.take_profit,
            content_text: message.text,
            original_timestamp: new Date(message.message_date),
          });

          if (savedMessage) {
            processedCount++;
          }
        } catch (err) {
          logger.warn(
            { err, uniqueHash },
            'Не удалось сохранить сообщение из буфера'
          );
          item.retryCount++;
        }
      }

      // Удаляем успешно обработанные
      this.buffer.removeProcessed(processedCount);

      if (processedCount > 0) {
        logger.info({ processedCount }, '✅ Буфер сброшен в БД');
      }
    } finally {
      this.buffer.setIsFlushing(false);
    }

    return processedCount;
  }

  /**
   * Размер буфера
   */
  getBufferSize(): number {
    return this.buffer.size();
  }
}
