import { v4 as uuidv4 } from 'uuid';

/**
 * Стандартизированный торговый сигнал
 */
export interface TradingSignal {
  signal_id: string;
  timestamp: string;
  source: SignalSource;
  signal: SignalData;
  metadata: SignalMetadata;
}

export interface SignalSource {
  channel: string;
  channel_id: number;
  sender_name?: string;
  message_id: number;
  message_date: string;
  original_text: string;
  has_media: boolean;
  media: MediaFile[];
}

export interface MediaFile {
  file_id: string;
  file_type: 'photo' | 'document' | 'video' | 'audio';
  file_name?: string;
  file_size?: number;
  url?: string;
}

export interface SignalData {
  type: SignalType;
  priority: number;
  instrument: Instrument;
  timing?: Timing;
  direction?: Direction;
  indicators?: Indicators;
  trade_setup?: TradeSetup;
  funding_info?: FundingInfo;
  confidence: Confidence;
}

export type SignalType =
  | 'strong_signal'
  | 'medium_signal'
  | 'sentiment'
  | 'entry_signal'
  | 'quick_target'
  | 'funding_rate';

export interface Instrument {
  ticker: string;
  exchange: string;
  project_info?: string;
  asset_type: 'crypto' | 'stock' | 'forex' | 'commodity';
}

export interface Timing {
  timeframe?: string;
  signal_time?: string;
  expires_at?: string;
}

export interface Direction {
  side: 'long' | 'short' | 'neutral';
  strength: 'strong' | 'medium' | 'weak';
  pattern?: string;
  pattern_strength?: number;
  pattern_direction?: 'up' | 'down' | 'neutral';
}

export interface Indicators {
  rsi?: number;
  rsi_signal?: 'oversold' | 'overbought' | 'neutral';
  sentiment?: SentimentData;
}

export interface SentimentData {
  day_change: number;
  change_24h: number;
  timeframe_zones: TimeframeZone[];
}

export interface TimeframeZone {
  timeframe: string;
  zone: 'OS' | 'OB';
  zone_percent: number;
  rsi?: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface TradeSetup {
  entry_price?: number;
  current_price?: number;
  targets?: number[];
  stop_loss?: StopLoss;
  expected_profit?: string;
  progress_to_target?: string;
  risk_reward_ratio?: number;
}

export interface StopLoss {
  stop_0_5?: number;
  stop_1?: number;
  stop_manual?: number;
}

export interface FundingInfo {
  funding_rate: number;
  funding_time: string;
  receiver: 'longs' | 'shorts';
  recommended_action: 'long' | 'short' | 'neutral';
  trading_link?: string;
  next_funding_in?: number;
}

export interface Confidence {
  score: number;
  factors: string[];
}

export interface SignalMetadata {
  parser_version: string;
  processing_time_ms: number;
  language: 'en' | 'ru' | 'mixed';
  tags: string[];
  warnings?: string[];
}

/**
 * Парсер торговых сигналов Telegram
 */
export class SignalParser {
  private readonly parserVersion = '1.0.0';

  /**
   * Парсинг сырого сообщения в стандартизированный сигнал
   */
  parse(rawMessage: RawMessage): TradingSignal | null {
    const startTime = Date.now();

    // Базовая валидация
    if (!rawMessage.text || !rawMessage.text.trim()) {
      return null;
    }

    // Определение типа сигнала
    const signalType = this.detectSignalType(rawMessage.text);
    if (!signalType) {
      return null;
    }

    // Парсинг по типу
    let signalData: SignalData | null = null;

    switch (signalType) {
      case 'strong_signal':
      case 'medium_signal':
        signalData = this.parseDirectionalSignal(rawMessage, signalType);
        break;
      case 'sentiment':
        signalData = this.parseSentimentSignal(rawMessage);
        break;
      case 'entry_signal':
        signalData = this.parseEntrySignal(rawMessage);
        break;
      case 'quick_target':
        signalData = this.parseQuickTargetSignal(rawMessage);
        break;
      case 'funding_rate':
        signalData = this.parseFundingRateSignal(rawMessage);
        break;
    }

    if (!signalData) {
      return null;
    }

    // Валидация
    if (!this.validateSignal(signalData)) {
      return null;
    }

    const processingTime = Date.now() - startTime;
    const language = this.detectLanguage(rawMessage.text);
    const tags = this.generateTags(signalData);

    return {
      signal_id: uuidv4(),
      timestamp: new Date().toISOString(),
      source: {
        channel: rawMessage.chat_title || 'Unknown',
        channel_id: rawMessage.chat_id,
        sender_name: rawMessage.sender_name || undefined,
        message_id: rawMessage.message_id,
        message_date: rawMessage.message_date,
        original_text: rawMessage.text,
        has_media: rawMessage.has_media || false,
        media: rawMessage.files?.map(f => ({
          file_id: f.file_id,
          file_type: f.file_type as 'photo' | 'document' | 'video' | 'audio',
          file_name: f.file_name,
          file_size: f.file_size,
        })) || [],
      },
      signal: signalData,
      metadata: {
        parser_version: this.parserVersion,
        processing_time_ms: processingTime,
        language,
        tags,
      },
    };
  }

  /**
   * Определение типа сигнала
   */
  private detectSignalType(text: string): SignalType | null {
    // Funding Rate
    if (/⚡️.*Сигнал по фандингу/i.test(text)) {
      return 'funding_rate';
    }

    // Quick Target (RU)
    if (/НОВАЯ ЦЕЛЬ (РОСТА|СНИЖЕНИЯ)/i.test(text)) {
      return 'quick_target';
    }

    // SENTIMENT
    if (/#SENTIMENT/i.test(text) || /Day\s*-\s*[\d.]+%.*24h/i.test(text)) {
      return 'sentiment';
    }

    // StrongSignal
    if (/#StrongSignal/i.test(text)) {
      return 'strong_signal';
    }

    // MediumSignal
    if (/#MediumSignal/i.test(text)) {
      return 'medium_signal';
    }

    // Entry Signal (с Entry/Targets/Stop)
    if (/\*\*Entry:\*\*/i.test(text) && /\*\*Targets:\*\*/i.test(text)) {
      return 'entry_signal';
    }

    return null;
  }

  /**
   * Парсинг directional сигналов (Strong/Medium)
   */
  private parseDirectionalSignal(
    rawMessage: RawMessage,
    type: 'strong_signal' | 'medium_signal'
  ): SignalData | null {
    const text = rawMessage.text;

    // Ticker
    const tickerMatch = text.match(/#([A-Z]{3,10})(?:\s|#)/) ||
                        text.match(/\*\*Ticker:\*\*\s*([A-Z]{3,10})/i);
    const ticker = tickerMatch?.[1] || null;

    // Exchange
    const exchangeMatch = text.match(/\b(BINANCE|BYBIT|MEXC|BATS)\b/i);
    const exchange = exchangeMatch?.[1]?.toUpperCase() || null;

    // Timeframe
    const timeframeMatch = text.match(/\*\*\s*([0-9]+(?:min|h|d)|[0-9]+\s*(?:min|минут|час|часа|ч))\s*\*\*/i);
    const timeframe = timeframeMatch ? this.normalizeTimeframe(timeframeMatch[1]) : undefined;

    // Project info
    const projectMatch = text.match(/✔️([^\n]+)/i);
    const projectInfo = projectMatch?.[1]?.trim();

    // Pattern и направление
    const isStrong = type === 'strong_signal';
    const patternLine = text.match(/(🔴{1,2}|🟢{1,2})\*\*?(↑|↓)?\s*([^\n]+?)\s*(↓|↑)?\*\*?\s+([\d.]+)%/i);
    
    const directionEmoji = patternLine?.[1] || '';
    const isLong = directionEmoji.includes('🟢');
    const side: 'long' | 'short' = isLong ? 'long' : 'short';
    const strength: 'strong' | 'medium' = isStrong ? 'strong' : 'medium';

    const patternRaw = patternLine?.[3] || '';
    const pattern = this.normalizePattern(patternRaw);
    const patternStrength = parseFloat(patternLine?.[5] || '0') || undefined;
    const patternDirection = patternLine?.[2] === '↑' ? 'down' : 'up';

    // RSI
    const rsiMatch = text.match(/\*\*RSI:\*\*\s*([\d.]+)/i);
    const rsi = rsiMatch ? parseFloat(rsiMatch[1]) : undefined;
    const rsiSignal = rsi ? this.getRsiSignal(rsi) : undefined;

    // Last price
    const priceMatch = text.match(/\*\*Last price:\*\*\s*([\d.]+)/i);
    const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : undefined;

    // Signal time
    const timeMatch = text.match(/T(\d+):(\d+):(\d+)\s*UTC/i);
    const signalTime = timeMatch ? this.parseVasyaTime(rawMessage.message_date, timeMatch) : undefined;

    const confidence = this.calculateDirectionalConfidence({
      type,
      rsi,
      patternStrength,
      hasEntryTargets: false,
    });

    return {
      type,
      priority: type === 'strong_signal' ? 1 : 2,
      instrument: {
        ticker: ticker || 'UNKNOWN',
        exchange: exchange || 'UNKNOWN',
        project_info: projectInfo,
        asset_type: 'crypto',
      },
      timing: {
        timeframe,
        signal_time: signalTime,
      },
      direction: {
        side,
        strength,
        pattern,
        pattern_strength: patternStrength,
        pattern_direction: patternDirection,
      },
      indicators: {
        rsi,
        rsi_signal: rsiSignal,
      },
      trade_setup: currentPrice ? { current_price: currentPrice } : undefined,
      confidence,
    };
  }

  /**
   * Парсинг SENTIMENT сигнала
   */
  private parseSentimentSignal(rawMessage: RawMessage): SignalData | null {
    const text = rawMessage.text;

    // Ticker
    const tickerMatch = text.match(/#([A-Z]{3,10})(?:\s|#)/) ||
                        text.match(/\*\*Ticker:\*\*\s*([A-Z]{3,10})/i);
    const ticker = tickerMatch?.[1] || null;

    // Exchange
    const exchangeMatch = text.match(/\b(BINANCE|BYBIT|MEXC|BATS)\b/i);
    const exchange = exchangeMatch?.[1]?.toUpperCase() || null;

    // Day change / 24h change
    const dayChangeMatch = text.match(/\*\*Day\*\*\s*(-?[\d.]+)%/i);
    const change24hMatch = text.match(/\*\*24h\*\*\s*(-?[\d.]+)%/i);
    const dayChange = dayChangeMatch ? parseFloat(dayChangeMatch[1]) : 0;
    const change24h = change24hMatch ? parseFloat(change24hMatch[1]) : 0;

    // Timeframe zones
    const timeframeZones: TimeframeZone[] = [];
    const zonePattern = /(→|▲|▼)\*\*(🟩|🟥)(OS|OB)\*\*\s*([\d.]+)%\s*\/\s*([\d.]+)\s*-\s*\*\*([^\*]+)\*\*/gi;
    let zoneMatch;

    while ((zoneMatch = zonePattern.exec(text)) !== null) {
      const trendRaw = zoneMatch[1];
      const zoneColor = zoneMatch[2]; // 🟩 = OS, 🟥 = OB
      const zone = zoneMatch[3] as 'OS' | 'OB';
      const zonePercent = parseFloat(zoneMatch[4]);
      const rsi = parseFloat(zoneMatch[5]);
      const timeframeRaw = zoneMatch[6];

      const trend: 'up' | 'down' | 'neutral' =
        trendRaw === '▲' ? 'up' : trendRaw === '▼' ? 'down' : 'neutral';

      timeframeZones.push({
        timeframe: this.normalizeTimeframe(timeframeRaw.trim()),
        zone,
        zone_percent: zonePercent,
        rsi,
        trend,
      });
    }

    // Last price
    const priceMatch = text.match(/\*\*Last price:\*\*\s*([\d.]+)/i);
    const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : undefined;

    const confidence = this.calculateSentimentConfidence(timeframeZones);

    return {
      type: 'sentiment',
      priority: 4,
      instrument: {
        ticker: ticker || 'UNKNOWN',
        exchange: exchange || 'UNKNOWN',
        asset_type: 'crypto',
      },
      timing: {
        timeframe: '1d',
        signal_time: new Date(rawMessage.message_date).toISOString(),
      },
      direction: {
        side: 'neutral',
        strength: 'weak',
      },
      indicators: {
        sentiment: {
          day_change: dayChange,
          change_24h: change24h,
          timeframe_zones: timeframeZones,
        },
      },
      trade_setup: currentPrice ? { current_price: currentPrice } : undefined,
      confidence,
    };
  }

  /**
   * Парсинг Entry сигнала
   */
  private parseEntrySignal(rawMessage: RawMessage): SignalData | null {
    const text = rawMessage.text;

    // Ticker
    const tickerMatch = text.match(/#([A-Z]{3,10})(?:\s|\n)/) ||
                        text.match(/\*\*Ticker:\*\*\s*([A-Z]{3,10})/i);
    const ticker = tickerMatch?.[1] || null;

    // Exchange
    const exchangeMatch = text.match(/(🔴|🟢)(BINANCE|BYBIT|MEXC|BATS)/i);
    const exchange = exchangeMatch?.[2]?.toUpperCase() || null;
    const directionEmoji = exchangeMatch?.[1];

    // Timeframe
    const timeframeMatch = text.match(/\*\*\s*([0-9]+(?:min|h|d)|[0-9]+\s*(?:min|минут|час|часа|ч))\s*\*\*/i);
    const timeframe = timeframeMatch ? this.normalizeTimeframe(timeframeMatch[1]) : undefined;

    // Project info
    const projectMatch = text.match(/✔️([^\n]+)/i);
    const projectInfo = projectMatch?.[1]?.trim();

    // Entry price
    const entryMatch = text.match(/\*\*Entry:\*\*\s*([\d.]+)/i);
    const entryPrice = entryMatch ? parseFloat(entryMatch[1]) : undefined;

    // Targets
    const targetsMatch = text.match(/\*\*Targets:\*\*\s*([^\n]+)/i);
    const targets: number[] = [];
    if (targetsMatch) {
      const targetNumbers = targetsMatch[1].match(/[\d.]+/g);
      if (targetNumbers) {
        targets.push(...targetNumbers.map(parseFloat));
      }
    }

    // Stop loss
    const stop05Match = text.match(/\*\*0\.5%\*\*\s*-\s*([\d.]+)/i);
    const stop1Match = text.match(/\*\*1%\*\*\s*-\s*([\d.]+)/i);
    const stopLoss: StopLoss | undefined = stop05Match || stop1Match ? {
      stop_0_5: stop05Match ? parseFloat(stop05Match[1]) : undefined,
      stop_1: stop1Match ? parseFloat(stop1Match[1]) : undefined,
    } : undefined;

    // Expected profit
    const profitMatch = text.match(/\*\*Expected profit:\*\*\s*([^\n]+)/i);
    const expectedProfit = profitMatch?.[1]?.trim();

    // Progress to target
    const progressMatch = text.match(/([\d.]+%\s*-\s*[\d.]+%)\s*to target/i);
    const progressToTarget = progressMatch?.[1];

    // Signal time
    const timeMatch = text.match(/T(\d+):(\d+):(\d+)\s*UTC/i);
    const signalTime = timeMatch ? this.parseVasyaTime(rawMessage.message_date, timeMatch) : undefined;

    const side: 'long' | 'short' = directionEmoji?.includes('🟢') ? 'long' : 'short';

    const confidence = this.calculateEntryConfidence({
      hasEntry: !!entryPrice,
      hasTargets: targets.length > 0,
      hasStopLoss: !!stopLoss,
    });

    return {
      type: 'entry_signal',
      priority: 2,
      instrument: {
        ticker: ticker || 'UNKNOWN',
        exchange: exchange || 'UNKNOWN',
        project_info: projectInfo,
        asset_type: 'crypto',
      },
      timing: {
        timeframe,
        signal_time: signalTime,
        expires_at: signalTime ? new Date(new Date(signalTime).getTime() + 2 * 60 * 60 * 1000).toISOString() : undefined,
      },
      direction: {
        side,
        strength: 'medium',
        pattern_direction: side === 'long' ? 'up' : 'down',
      },
      trade_setup: {
        entry_price: entryPrice,
        current_price: entryPrice,
        targets: targets.length > 0 ? targets : undefined,
        stop_loss: stopLoss,
        expected_profit: expectedProfit,
        progress_to_target: progressToTarget,
      },
      confidence,
    };
  }

  /**
   * Парсинг Quick Target сигнала (RU)
   */
  private parseQuickTargetSignal(rawMessage: RawMessage): SignalData | null {
    const text = rawMessage.text;

    // Timestamp в начале
    const timestampMatch = text.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
    const signalTime = timestampMatch ? new Date(timestampMatch[1]).toISOString() : new Date(rawMessage.message_date).toISOString();

    // Exchange
    const exchangeMatch = text.match(/,\s*(BINANCE|BYBIT|MEXC|BATS)/i);
    const exchange = exchangeMatch?.[1]?.toUpperCase() || null;

    // Ticker
    const tickerMatch = text.match(/\*\*Тикер:\*\*\s*([A-Z]{3,10})/i);
    const ticker = tickerMatch?.[1] || null;

    // Timeframe
    const timeframeMatch = text.match(/\*\*Таймфрейм:\*\*\s*(\d+)\s*(?:минут|мин)/i);
    const timeframe = timeframeMatch ? `${timeframeMatch[1]}min` : undefined;

    // Direction
    const isLong = /НОВАЯ ЦЕЛЬ РОСТА/i.test(text);
    const side: 'long' | 'short' = isLong ? 'long' : 'short';

    // Entry
    const entryMatch = text.match(/\*\*Вход:\*\*\s*([\d.]+)/i);
    const entryPrice = entryMatch ? parseFloat(entryMatch[1]) : undefined;

    // Targets
    const targetsMatch = text.match(/\*\*Тейки:\*\*\s*([^\n]+)/i);
    const targets: number[] = [];
    if (targetsMatch) {
      const targetNumbers = targetsMatch[1].match(/[\d.]+/g);
      if (targetNumbers) {
        targets.push(...targetNumbers.map(parseFloat));
      }
    }

    const confidence = this.calculateQuickTargetConfidence({
      timeframe,
      hasTargets: targets.length > 0,
    });

    return {
      type: 'quick_target',
      priority: 2,
      instrument: {
        ticker: ticker || 'UNKNOWN',
        exchange: exchange || 'UNKNOWN',
        asset_type: 'crypto',
      },
      timing: {
        timeframe,
        signal_time: signalTime,
        expires_at: new Date(new Date(signalTime).getTime() + 30 * 60 * 1000).toISOString(),
      },
      direction: {
        side,
        strength: 'medium',
        pattern_direction: side === 'long' ? 'up' : 'down',
      },
      trade_setup: {
        entry_price: entryPrice,
        current_price: entryPrice,
        targets: targets.length > 0 ? targets : undefined,
      },
      confidence,
    };
  }

  /**
   * Парсинг Funding Rate сигнала
   */
  private parseFundingRateSignal(rawMessage: RawMessage): SignalData | null {
    const text = rawMessage.text;

    // Exchange
    const exchangeMatch = text.match(/Сигнал по фандингу\s*\((BYBIT|MEXC)\)/i);
    const exchange = exchangeMatch?.[1]?.toUpperCase() || null;

    // Instrument (из ссылки)
    const instrumentMatch = text.match(/\*\*Инструмент:\*\*\s*\[([A-Z]+)\]\(([^)]+)\)/i);
    const ticker = instrumentMatch?.[1] || null;
    const tradingLink = instrumentMatch?.[2] || undefined;

    // Funding time
    const timeMatch = text.match(/\*\*Время:\*\*\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/i);
    let fundingTime: string | undefined;
    if (timeMatch) {
      const [, day, month, year, hour, min] = timeMatch;
      fundingTime = `${year}-${month}-${day}T${hour}:${min}:00Z`;
    }

    // Funding rate
    const rateMatch = text.match(/\*\*Ставка:\*\*\s*(-?[\d.]+)%/i);
    const fundingRate = rateMatch ? parseFloat(rateMatch[1]) : 0;

    // Receiver
    const receiver = fundingRate < 0 ? 'longs' : 'shorts';
    const isLongsReceive = /Лонги получают/i.test(text);
    const recommendedAction: 'long' | 'short' = isLongsReceive || fundingRate < 0 ? 'long' : 'short';

    // Calculate next funding
    let nextFundingIn: number | undefined;
    if (fundingTime) {
      const fundingDate = new Date(fundingTime);
      const now = new Date();
      nextFundingIn = Math.max(0, Math.floor((fundingDate.getTime() - now.getTime()) / 1000));
    }

    const confidence = this.calculateFundingConfidence({
      fundingRate,
    });

    return {
      type: 'funding_rate',
      priority: 3,
      instrument: {
        ticker: ticker || 'UNKNOWN',
        exchange: exchange || 'UNKNOWN',
        asset_type: 'crypto',
      },
      timing: {
        signal_time: fundingTime,
      },
      funding_info: {
        funding_rate: fundingRate,
        funding_time: fundingTime || new Date().toISOString(),
        receiver,
        recommended_action: recommendedAction,
        trading_link: tradingLink,
        next_funding_in: nextFundingIn,
      },
      confidence,
    };
  }

  /**
   * Валидация сигнала
   */
  private validateSignal(signal: SignalData): boolean {
    if (!signal.instrument.ticker || signal.instrument.ticker === 'UNKNOWN') {
      return false;
    }
    if (!signal.instrument.exchange || signal.instrument.exchange === 'UNKNOWN') {
      return false;
    }
    if (['strong_signal', 'medium_signal', 'entry_signal', 'quick_target'].includes(signal.type)) {
      if (!signal.direction?.side) {
        return false;
      }
    }
    return true;
  }

  /**
   * Нормализация таймфрейма
   */
  private normalizeTimeframe(tf: string): string {
    const normalized = tf.toLowerCase().trim();

    const mapping: Record<string, string> = {
      '1min': '1min', '1 min': '1min', '1 minute': '1min',
      '3min': '3min', '3 min': '3min',
      '5min': '5min', '5 min': '5min', '5 минут': '5min',
      '15min': '15min', '15 min': '15min', '15 минут': '15min',
      '30min': '30min', '30 min': '30min', '30 минут': '30min',
      '1h': '1h', '1 hour': '1h', '1 час': '1h', '1 часа': '1h',
      '2h': '2h', '2 hour': '2h', '2 часа': '2h',
      '4h': '4h', '4 hour': '4h', '4 часа': '4h',
      '12h': '12h', '12 hour': '12h', '12 часов': '12h',
      '1d': '1d', '1 day': '1d', 'd': '1d', 'daily': '1d',
    };

    return mapping[normalized] || normalized;
  }

  /**
   * Нормализация паттерна
   */
  private normalizePattern(pattern: string): string {
    const p = pattern.toLowerCase();
    if (p.includes('trend')) return 'trend_reversal';
    if (p.includes('ob')) return 'ob_reversal';
    if (p.includes('os')) return 'os_reversal';
    if (p.includes('breakout')) return 'breakout';
    if (p.includes('pullback')) return 'pullback';
    if (p.includes('divergence')) return 'divergence';
    return 'unknown';
  }

  /**
   * RSI сигнал
   */
  private getRsiSignal(rsi: number): 'oversold' | 'overbought' | 'neutral' {
    if (rsi > 70) return 'overbought';
    if (rsi < 30) return 'oversold';
    return 'neutral';
  }

  /**
   * Парсинг времени VasyaBTC
   */
  private parseVasyaTime(messageDate: string, timeMatch: RegExpMatchArray): string {
    try {
      const [, hour, min, sec] = timeMatch;
      const date = new Date(messageDate);
      date.setUTCHours(parseInt(hour), parseInt(min), parseInt(sec), 0);
      return date.toISOString();
    } catch {
      return new Date(messageDate).toISOString();
    }
  }

  /**
   * Расчёт confidence для directional сигналов
   */
  private calculateDirectionalConfidence(params: {
    type: 'strong_signal' | 'medium_signal';
    rsi?: number;
    patternStrength?: number;
    hasEntryTargets: boolean;
  }): Confidence {
    let score = 50;
    const factors: string[] = [];

    if (params.type === 'strong_signal') {
      score += 20;
      factors.push('Сильный сигнал');
    }

    if (params.rsi !== undefined) {
      if (params.rsi > 70 || params.rsi < 30) {
        score += 10;
        factors.push(`RSI в экстремальной зоне (${params.rsi})`);
      }
    }

    if (params.patternStrength !== undefined) {
      if (params.patternStrength > 50) {
        score += 15;
        factors.push(`Сильный паттерн (${params.patternStrength}%)`);
      } else if (params.patternStrength < 30) {
        score -= 10;
        factors.push(`Слабый паттерн (${params.patternStrength}%)`);
      }
    }

    score = Math.max(0, Math.min(100, score));

    return { score, factors };
  }

  /**
   * Расчёт confidence для sentiment сигналов
   */
  private calculateSentimentConfidence(zones: TimeframeZone[]): Confidence {
    let score = 50;
    const factors: string[] = [];

    const obCount = zones.filter(z => z.zone === 'OB').length;
    const osCount = zones.filter(z => z.zone === 'OS').length;

    if (obCount > 4 || osCount > 4) {
      score += 15;
      factors.push(`Преобладание ${obCount > osCount ? 'OB' : 'OS'} зон`);
    }

    score = Math.max(0, Math.min(100, score));

    return { score, factors };
  }

  /**
   * Расчёт confidence для entry сигналов
   */
  private calculateEntryConfidence(params: {
    hasEntry: boolean;
    hasTargets: boolean;
    hasStopLoss: boolean;
  }): Confidence {
    let score = 50;
    const factors: string[] = [];

    if (params.hasEntry && params.hasTargets) {
      score += 15;
      factors.push('Чёткие уровни входа и выхода');
    }

    if (params.hasStopLoss) {
      score += 10;
      factors.push('Указаны стоп-лоссы');
    }

    score = Math.max(0, Math.min(100, score));

    return { score, factors };
  }

  /**
   * Расчёт confidence для quick target
   */
  private calculateQuickTargetConfidence(params: {
    timeframe?: string;
    hasTargets: boolean;
  }): Confidence {
    let score = 50;
    const factors: string[] = [];

    if (params.hasTargets) {
      score += 10;
      factors.push('Указаны цели');
    }

    if (params.timeframe && ['5min', '15min'].includes(params.timeframe)) {
      score -= 5;
      factors.push('Короткий таймфрейм');
    }

    score = Math.max(0, Math.min(100, score));

    return { score, factors };
  }

  /**
   * Расчёт confidence для funding rate
   */
  private calculateFundingConfidence(params: {
    fundingRate: number;
  }): Confidence {
    let score = 70;
    const factors: string[] = [];

    if (params.fundingRate < 0) {
      factors.push('Отрицательный фандинг (лонги получают)');
    } else {
      factors.push('Положительный фандинг (шорты получают)');
    }

    if (Math.abs(params.fundingRate) > 0.5) {
      score += 15;
      factors.push('Высокая ставка фандинга');
    }

    factors.push('Автоматический сигнал от бота');
    score = Math.max(0, Math.min(100, score + 5));

    return { score, factors };
  }

  /**
   * Определение языка
   */
  private detectLanguage(text: string): 'en' | 'ru' | 'mixed' {
    const hasCyrillic = /[\u0400-\u04FF]/.test(text);
    const hasLatin = /[a-zA-Z]{3,}/.test(text);

    if (hasCyrillic && hasLatin) return 'mixed';
    if (hasCyrillic) return 'ru';
    return 'en';
  }

  /**
   * Генерация тегов
   */
  private generateTags(signal: SignalData): string[] {
    const tags: string[] = [];

    tags.push(signal.type);

    if (signal.instrument.exchange) {
      tags.push(signal.instrument.exchange.toLowerCase());
    }

    if (signal.direction?.side) {
      tags.push(signal.direction.side);
    }

    if (signal.direction?.strength) {
      tags.push(signal.direction.strength);
    }

    return tags;
  }
}

/**
 * Сырое сообщение от Telegrab
 */
export interface RawMessage {
  message_id: number;
  chat_id: number;
  chat_title: string;
  text: string;
  sender_name?: string;
  message_date: string;
  has_media?: boolean;
  files?: Array<{
    file_id: string;
    file_type: string;
    file_name?: string;
    file_size?: number;
  }>;
}
