import { logger } from '../utils/logger';

export interface BufferedMessage {
  data: unknown;
  timestamp: number;
  retryCount: number;
}

/**
 * Буфер в памяти для сообщений при недоступности БД
 * Максимум 500 сообщений, при переполнении удаляются старые
 */
export class MessageBuffer {
  private buffer: BufferedMessage[] = [];
  private maxSize: number = 500;
  private isFlushing: boolean = false;

  /**
   * Добавление сообщения в буфер
   */
  add(data: unknown): boolean {
    if (this.buffer.length >= this.maxSize) {
      // Переполнение - удаляем oldest
      this.buffer.shift();
      logger.warn(
        { bufferSize: this.buffer.length },
        `Буфер переполнен, удалено старое сообщение`
      );
    }

    this.buffer.push({
      data,
      timestamp: Date.now(),
      retryCount: 0,
    });

    logger.debug(
      { bufferSize: this.buffer.length },
      'Сообщение добавлено в буфер'
    );

    return true;
  }

  /**
   * Получение всех сообщений из буфера
   */
  getAll(): BufferedMessage[] {
    return [...this.buffer];
  }

  /**
   * Очистка буфера
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Удаление обработанных сообщений
   */
  removeProcessed(count: number): void {
    this.buffer.splice(0, count);
    logger.debug({ bufferSize: this.buffer.length }, 'Буфер очищен');
  }

  /**
   * Размер буфера
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Проверка на пустоту
   */
  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Инкремент счётчика попыток для всех сообщений
   */
  incrementRetries(): void {
    for (const item of this.buffer) {
      item.retryCount++;
    }
  }

  /**
   * Проверка, идёт ли сейчас сброс
   */
  getIsFlushing(): boolean {
    return this.isFlushing;
  }

  /**
   * Установка флага сброса
   */
  setIsFlushing(value: boolean): void {
    this.isFlushing = value;
  }
}
