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
    const { chat_id, chat_title, message_id, text, message_date } = message;

    // 1. Фильтрация по каналу
    const isChannelActive = await this.channelRepo.isActiveChannel(chat_id);
    if (!isChannelActive) {
      logger.debug(
        { chat_id, chat_title },
        'Канал не в белом списке, сообщение пропущено'
      );
      return null;
    }

    // 2. Формирование unique_hash для дедупликации
    const uniqueHash = `${chat_id}_${message_id}`;

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
        channel_id: chat_id,
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

      return {
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
