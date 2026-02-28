import { describe, it, expect } from 'vitest';
import { SignalParser, RawMessage } from '../src/services/signal-parser';

/**
 * Тесты для SignalParser (новый парсер)
 */
describe('SignalParser', () => {
  const parser = new SignalParser();

  // Вспомогательная функция для создания тестового сообщения
  const createRawMessage = (text: string, chatId: number = 2678035223): RawMessage => ({
    message_id: 1,
    chat_id: chatId,
    chat_title: 'Test Channel',
    text,
    message_date: new Date().toISOString(),
    has_media: false,
    files: [],
  });

  describe('Strong Signal detection', () => {
    it('должен определять Strong Signal по хештегу', () => {
      const text = `#BTCUSDT #StrongSignal
BINANCE, T10:30:00 UTC

**Ticker:** BTCUSDT
** 5min **
✔️ Trend Reversal Pattern

🔴🔴**↓ TREND Reversal ↑** 65%
**RSI:** 72
**SHORT**`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.type).toBe('strong_signal');
      expect(result?.signal.direction?.side).toBe('short');
      expect(result?.signal.instrument.ticker).toBe('BTCUSDT');
    });

    it('должен определять Medium Signal по хештегу', () => {
      const text = `#ETHUSDT #MediumSignal
BYBIT, T14:00:00 UTC

🟢🟢**↑ OS Reversal ↓** 55%
**RSI:** 25
**LONG**`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.type).toBe('medium_signal');
      expect(result?.signal.direction?.side).toBe('long');
    });
  });

  describe('Sentiment detection', () => {
    it('должен определять SENTIMENT сигнал', () => {
      const text = `#ETHUSDT #SENTIMENT
BINANCE, 2026-2-24, T23:59:00 UTC

**Ticker:** ETHUSDT
                  **Day** -0.2% / **24h** -0.2%

▼**🟩OS** 72%  /  42.7 - **5 min**`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.type).toBe('sentiment');
      expect(result?.signal.indicators?.sentiment).toBeDefined();
    });

    it('должен игнорировать OB/OS паттерны без SENTIMENT', () => {
      const text = '▼**🟥OB** 75%  /  55 - **1h**';
      const result = parser.parse(createRawMessage(text));
      expect(result).toBeNull();
    });
  });

  describe('Entry Signal detection', () => {
    it('должен определять Entry Signal с Entry/Targets/Stop', () => {
      const text = `#BTCUSDT
🟢BINANCE

**Ticker:** BTCUSDT
** 15min **
✔️ Long position

**Entry:** 45000
**Targets:** 46000, 47000, 48000
**0.5%** - 44500
**1%** - 44000

**Expected profit:** 5-10%`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.type).toBe('entry_signal');
      expect(result?.signal.direction?.side).toBe('long');
      expect(result?.signal.trade_setup?.entry_price).toBe(45000);
      expect(result?.signal.trade_setup?.targets).toEqual([46000, 47000, 48000]);
    });
  });

  describe('Quick Target detection', () => {
    it('должен определять Quick Target на русском', () => {
      const text = `2026-02-24T10:30:00Z, BYBIT
🟢 НОВАЯ ЦЕЛЬ РОСТА

**Тикер:** BTCUSDT
**Таймфрейм:** 15 минут

**Вход:** 45000
**Тейки:** 46000, 47000`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.type).toBe('quick_target');
      expect(result?.signal.direction?.side).toBe('long');
    });

    it('должен определять Short Quick Target', () => {
      const text = `2026-02-24T10:30:00Z, MEXC
🔴 НОВАЯ ЦЕЛЬ СНИЖЕНИЯ

**Тикер:** ETHUSDT
**Таймфрейм:** 5 минут

**Вход:** 2000
**Тейки:** 1950, 1900`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.type).toBe('quick_target');
      expect(result?.signal.direction?.side).toBe('short');
    });
  });

  describe('Funding Rate detection', () => {
    it('должен определять Funding Rate сигнал', () => {
      const text = `⚡️ Сигнал по фандингу (BYBIT)

**Инструмент:** [BTCUSDT](https://example.com)
**Время:** 28.02.2026 10:00
**Ставка:** -0.6000%

Лонги получают`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.type).toBe('funding_rate');
      expect(result?.signal.funding_info?.funding_rate).toBe(-0.6);
      expect(result?.signal.funding_info?.receiver).toBe('longs');
      expect(result?.signal.funding_info?.recommended_action).toBe('long');
    });
  });

  describe('Null results', () => {
    it('должен возвращать null для пустого сообщения', () => {
      const result = parser.parse(createRawMessage(''));
      expect(result).toBeNull();
    });

    it('должен возвращать null для сообщения без сигнала', () => {
      const text = 'Просто какое-то сообщение без сигнала';
      const result = parser.parse(createRawMessage(text));
      expect(result).toBeNull();
    });

    it('должен возвращать null если нет тикера', () => {
      const text = `#StrongSignal
🔴🔴**↓ Pattern ↑** 60%
**RSI:** 70`;
      const result = parser.parse(createRawMessage(text));
      expect(result).toBeNull();
    });
  });

  describe('Confidence calculation', () => {
    it('должен рассчитывать confidence для strong signal', () => {
      const text = `#BTCUSDT #StrongSignal
BINANCE, T10:30:00 UTC

🔴🔴**↓ Pattern ↑** 65%
**RSI:** 72
**SHORT**`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.confidence.score).toBeGreaterThan(50);
      expect(result?.signal.confidence.factors.length).toBeGreaterThan(0);
    });

    it('должен рассчитывать confidence для entry signal', () => {
      const text = `#BTCUSDT
🟢BINANCE
**Ticker:** BTCUSDT
**Entry:** 45000
**Targets:** 46000
**0.5%** - 44500`;
      
      const result = parser.parse(createRawMessage(text));
      expect(result).not.toBeNull();
      expect(result?.signal.confidence.score).toBeGreaterThan(50);
    });
  });
});
