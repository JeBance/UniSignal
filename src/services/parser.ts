import { readFileSync } from 'fs';
import { parse } from 'yaml';
import path from 'path';
import { logger } from '../utils/logger';

export interface PatternConfig {
  pattern: string;
  group?: number;
}

export interface DirectionConfig {
  long: string[];
  short: string[];
}

export interface ChannelParserConfig {
  direction?: DirectionConfig;
  ticker?: PatternConfig;
  entry?: PatternConfig;
  stop_loss?: PatternConfig;
  take_profit?: PatternConfig;
}

export interface ParsersConfig {
  channels: {
    default: ChannelParserConfig;
    [chatId: number | string]: ChannelParserConfig;
  };
}

export interface SignalData {
  direction: 'LONG' | 'SHORT' | null;
  ticker: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}

/**
 * Парсер сигналов из текста сообщений
 * Использует конфигурацию из config/parsers.yaml
 */
export class SignalParser {
  private config: ParsersConfig | null = null;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.resolve(__dirname, '../../config/parsers.yaml');
  }

  /**
   * Загрузка конфигурации парсеров
   */
  loadConfig(): boolean {
    try {
      if (!this.configPath || !this.configPath.endsWith('.yaml')) {
        logger.warn('Конфигурационный файл не указан или имеет неверное расширение');
        return false;
      }

      const fileContent = readFileSync(this.configPath, 'utf-8');
      this.config = parse(fileContent) as ParsersConfig;
      
      logger.info(
        { path: this.configPath },
        '✅ Конфигурация парсеров загружена'
      );
      return true;
    } catch (err: unknown) {
      logger.error(
        { err, path: this.configPath },
        'Ошибка загрузки конфигурации парсеров, используем значения по умолчанию'
      );
      this.config = null;
      return false;
    }
  }

  /**
   * Парсинг сигнала из текста
   */
  parse(text: string, chatId?: number): SignalData {
    if (!this.config) {
      this.loadConfig();
    }

    const config = this.getConfigForChannel(chatId);

    return {
      direction: this.parseDirection(text, config.direction),
      ticker: this.parseTicker(text, config.ticker),
      entry_price: this.parsePrice(text, config.entry),
      stop_loss: this.parsePrice(text, config.stop_loss),
      take_profit: this.parsePrice(text, config.take_profit),
    };
  }

  /**
   * Получение конфигурации для канала
   */
  private getConfigForChannel(chatId?: number): ChannelParserConfig {
    if (!this.config) {
      return this.getDefaultConfig();
    }

    // Проверяем специфичную конфигурацию для канала
    if (chatId && this.config.channels[chatId]) {
      return {
        ...this.config.channels.default,
        ...this.config.channels[chatId],
      };
    }

    // Возвращаем конфигурацию по умолчанию
    return this.config.channels.default;
  }

  /**
   * Конфигурация по умолчанию
   */
  private getDefaultConfig(): ChannelParserConfig {
    return {
      direction: {
        long: ['⬆️', '🟢', '🚀', 'Long', 'LONG', 'Buy', 'BUY', 'Лонг', 'ЛОНГ', 'Покупка'],
        short: ['⬇️', '🔴', '📉', 'Short', 'SHORT', 'Sell', 'SELL', 'Шорт', 'ШОРТ', 'Продажа'],
      },
      ticker: {
        pattern: '/\\b([A-Z]{3,6})(USDT|BTC|ETH|USD|BUSD)\\b/',
        group: 1,
      },
      entry: {
        pattern: '/(?:Entry|Вход|Enter|Open)[:\\s]*([0-9.,]+)/i',
        group: 1,
      },
      stop_loss: {
        pattern: '/(?:Stop Loss|Stop|SL|Стоп|СЛ)[:\\s]*([0-9.,]+)/i',
        group: 1,
      },
      take_profit: {
        pattern: '/(?:Take Profit|TP|Target|Тейк|ТП|Цель)[:\\s]*([0-9.,]+)/i',
        group: 1,
      },
    };
  }

  /**
   * Определение направления (LONG/SHORT)
   */
  private parseDirection(text: string, config?: DirectionConfig): 'LONG' | 'SHORT' | null {
    if (!config) {
      config = this.getDefaultConfig().direction!;
    }

    // Проверка на SHORT (сначала, чтобы избежать ложных срабатываний)
    for (const keyword of config.short) {
      if (text.includes(keyword)) {
        return 'SHORT';
      }
    }

    // Проверка на LONG
    for (const keyword of config.long) {
      if (text.includes(keyword)) {
        return 'LONG';
      }
    }

    return null;
  }

  /**
   * Извлечение тикера
   */
  private parseTicker(text: string, config?: PatternConfig): string | null {
    if (!config) {
      config = this.getDefaultConfig().ticker!;
    }

    return this.extractByRegex(text, config.pattern, config.group);
  }

  /**
   * Извлечение цены (Entry, SL, TP)
   */
  private parsePrice(text: string, config?: PatternConfig): number | null {
    if (!config) {
      return null;
    }

    const value = this.extractByRegex(text, config.pattern, config.group ?? 1);
    
    if (value) {
      // Замена запятой на точку для числового значения
      const numericValue = parseFloat(value.replace(',', '.'));
      return isNaN(numericValue) ? null : numericValue;
    }

    return null;
  }

  /**
   * Извлечение значения по регулярному выражению
   */
  private extractByRegex(text: string, pattern: string, groupIndex: number = 1): string | null {
    try {
      // Парсинг строки паттерна вида "/pattern/flags"
      const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
      
      if (!match) {
        // Если формат неверный, пробуем использовать как есть
        const regex = new RegExp(pattern);
        const result = regex.exec(text);
        return result?.[groupIndex] || null;
      }

      const [, regexPattern, flags] = match;
      const regex = new RegExp(regexPattern, flags);
      const result = regex.exec(text);
      
      return result?.[groupIndex] || null;
    } catch (err) {
      logger.warn({ err, pattern }, 'Ошибка компиляции регулярного выражения');
      return null;
    }
  }
}

// Экспорт функции для удобного использования
export function createSignalParser(configPath?: string): (text: string, chatId?: number) => SignalData {
  const parser = new SignalParser(configPath);
  parser.loadConfig();
  
  return (text: string, chatId?: number) => parser.parse(text, chatId);
}
