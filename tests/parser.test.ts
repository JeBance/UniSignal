import { describe, it, expect } from 'vitest';
import { SignalParser, createSignalParser } from '../src/services/parser';

describe('SignalParser', () => {
  const parser = new SignalParser();
  parser.loadConfig();

  describe('parseDirection', () => {
    it('должен определять LONG по эмодзи 🟢', () => {
      const text = '🟢 BTCUSDT LONG сигнал на покупку';
      const result = parser.parse(text);
      expect(result.direction).toBe('LONG');
    });

    it('должен определять LONG по слову Long', () => {
      const text = 'Long position on ETHUSDT';
      const result = parser.parse(text);
      expect(result.direction).toBe('LONG');
    });

    it('должен определять LONG по слову ЛОНГ', () => {
      const text = 'ЛОНГ по биткоину 50000';
      const result = parser.parse(text);
      expect(result.direction).toBe('LONG');
    });

    it('должен определять SHORT по эмодзи 🔴', () => {
      const text = '🔴 SHORT сигнал на продажу';
      const result = parser.parse(text);
      expect(result.direction).toBe('SHORT');
    });

    it('должен определять SHORT по слову Short', () => {
      const text = 'Short position on BTC';
      const result = parser.parse(text);
      expect(result.direction).toBe('SHORT');
    });

    it('должен возвращать null если направление не найдено', () => {
      const text = 'Просто какое-то сообщение без направления';
      const result = parser.parse(text);
      expect(result.direction).toBeNull();
    });

    it('должен определять SHORT приоритетно если есть оба маркера', () => {
      const text = '🟢🔴 BTCUSDT - неопределённый сигнал';
      const result = parser.parse(text);
      // SHORT проверяется первым
      expect(result.direction).toBe('SHORT');
    });
  });

  describe('parseTicker', () => {
    it('должен находить тикер BTCUSDT', () => {
      const text = '🟢 BTCUSDT LONG вход 50000';
      const result = parser.parse(text);
      expect(result.ticker).toBe('BTC');
    });

    it('должен находить тикер ETHUSDT', () => {
      const text = 'SHORT ETHUSDT по 2000';
      const result = parser.parse(text);
      expect(result.ticker).toBe('ETH');
    });

    it('должен находить тикер с BTC', () => {
      const text = 'Long ALTBTC на бирже';
      const result = parser.parse(text);
      expect(result.ticker).toBe('ALT');
    });

    it('должен возвращать null если тикер не найден', () => {
      const text = 'Просто сообщение без тикера';
      const result = parser.parse(text);
      expect(result.ticker).toBeNull();
    });
  });

  describe('parsePrice', () => {
    it('должен находить цену входа (Entry)', () => {
      const text = 'Entry: 45000 USDT';
      const result = parser.parse(text);
      expect(result.entry_price).toBe(45000);
    });

    it('должен находить цену входа (Вход)', () => {
      const text = 'Вход: 1950.50';
      const result = parser.parse(text);
      expect(result.entry_price).toBe(1950.50);
    });

    it('должен находить Stop Loss', () => {
      const text = 'SL: 44000';
      const result = parser.parse(text);
      expect(result.stop_loss).toBe(44000);
    });

    it('должен находить Stop Loss (Стоп)', () => {
      const text = 'Стоп: 1900.25';
      const result = parser.parse(text);
      expect(result.stop_loss).toBe(1900.25);
    });

    it('должен находить Take Profit (TP)', () => {
      const text = 'TP: 48000';
      const result = parser.parse(text);
      expect(result.take_profit).toBe(48000);
    });

    it('должен находить Take Profit (Тейк)', () => {
      const text = 'Тейк: 2100.75';
      const result = parser.parse(text);
      expect(result.take_profit).toBe(2100.75);
    });

    it('должен находить Target как тейк-профит', () => {
      const text = 'Target: 52000';
      const result = parser.parse(text);
      expect(result.take_profit).toBe(52000);
    });

    it('должен возвращать null если цена не найдена', () => {
      const text = 'Просто сообщение без цен';
      const result = parser.parse(text);
      expect(result.entry_price).toBeNull();
      expect(result.stop_loss).toBeNull();
      expect(result.take_profit).toBeNull();
    });

    it('должен обрабатывать числа с запятой', () => {
      const text = 'Entry: 1234,56';
      const result = parser.parse(text);
      expect(result.entry_price).toBe(1234.56);
    });
  });

  describe('complex signals', () => {
    it('должен парсить полный сигнал LONG', () => {
      const text = `
        🟢 LONG BTCUSDT
        Entry: 45000
        SL: 44000
        TP: 48000
      `;
      const result = parser.parse(text);
      expect(result.direction).toBe('LONG');
      expect(result.ticker).toBe('BTC');
      expect(result.entry_price).toBe(45000);
      expect(result.stop_loss).toBe(44000);
      expect(result.take_profit).toBe(48000);
    });

    it('должен парсить полный сигнал SHORT', () => {
      const text = `
        🔴 SHORT ETHUSDT
        Вход: 2000
        Stop: 2100
        Target: 1800
      `;
      const result = parser.parse(text);
      expect(result.direction).toBe('SHORT');
      expect(result.ticker).toBe('ETH');
      expect(result.entry_price).toBe(2000);
      expect(result.stop_loss).toBe(2100);
      expect(result.take_profit).toBe(1800);
    });

    it('должен парсить сигнал с несколькими TP', () => {
      const text = `
        🟢 LONG BTCUSDT
        Entry: 45000
        SL: 44000
        TP: 46000, 47000, 48000
      `;
      const result = parser.parse(text);
      expect(result.direction).toBe('LONG');
      expect(result.ticker).toBe('BTC');
      expect(result.entry_price).toBe(45000);
      // Берётся первое значение TP
      expect(result.take_profit).toBe(46000);
    });

    it('должен возвращать null для нераспознанного сообщения', () => {
      const text = 'Привет, это тестовое сообщение без сигнала';
      const result = parser.parse(text);
      expect(result.direction).toBeNull();
      expect(result.ticker).toBeNull();
      expect(result.entry_price).toBeNull();
      expect(result.stop_loss).toBeNull();
      expect(result.take_profit).toBeNull();
    });
  });

  describe('createSignalParser', () => {
    it('должен создавать функцию парсера', () => {
      const parseFn = createSignalParser();
      expect(typeof parseFn).toBe('function');
      
      const result = parseFn('🟢 LONG BTCUSDT Entry: 50000');
      expect(result.direction).toBe('LONG');
      expect(result.ticker).toBe('BTC');
      expect(result.entry_price).toBe(50000);
    });
  });
});
