# Парсер Telegram-сигналов: Техническое задание

## 📁 Структура артефактов

| Файл | Описание |
|------|----------|
| `signal_parser_agent_description.md` | Описание для ИИ-агента парсера |
| `trading_signal_schema.json` | JSON Schema валидации |
| `signal_examples.json` | Примеры стандартизированных сообщений |
| `PARSER_README.md` | Этот файл |

---

## 🏗 Архитектура парсера

```
┌─────────────────────────────────────────────────────────────────┐
│                    Telegram Channels                            │
│  VasyaBTC │ ASFunding_bot │ JeBance │ AutoScalping             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Raw Message Collector                        │
│              (Сбор сырых сообщений из Telegram)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Signal Parser (AI Agent)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ StrongSignal│ │ MediumSignal│ │ SENTIMENT  │ │ Funding   │ │
│  │   Parser    │ │   Parser    │ │   Parser   │ │   Parser  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│  ┌─────────────┐ ┌─────────────┐                                │
│  │ EntrySignal │ │ QuickTarget │                                │
│  │   Parser    │ │   Parser    │                                │
│  └─────────────┘ └─────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Normalizer                                   │
│  • Преобразование таймфреймов                                   │
│  • Нормализация времени (ISO8601)                               │
│  • Стандартизация направлений                                   │
│  • Валидация по JSON Schema                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Signal Validator                             │
│  • Проверка обязательных полей                                  │
│  • Фильтрация невалидных сигналов                             │
│  • Расчёт confidence score                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WebSocket Server                             │
│  • Отправка клиентам                                            │
│  • Prioritization queue                                         │
│  • Ack/Nack handling                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Trading Clients                              │
│  • Боты для торговли                                            │
│  • Мобильные приложения                                         │
│  • Веб-интерфейсы                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Реализация парсера (Python)

### Базовая структура

```python
from enum import Enum
from typing import Optional, List, Dict, Any
from datetime import datetime
import re
import uuid
import json

class SignalType(Enum):
    STRONG_SIGNAL = "strong_signal"
    MEDIUM_SIGNAL = "medium_signal"
    SENTIMENT = "sentiment"
    ENTRY_SIGNAL = "entry_signal"
    QUICK_TARGET = "quick_target"
    FUNDING_RATE = "funding_rate"

class Exchange(Enum):
    BINANCE = "BINANCE"
    BYBIT = "BYBIT"
    MEXC = "MEXC"
    BATS = "BATS"

class Direction(Enum):
    LONG = "long"
    SHORT = "short"
    NEUTRAL = "neutral"

class SignalParser:
    """Парсер торговых сигналов из Telegram"""
    
    def __init__(self):
        self.patterns = self._init_patterns()
    
    def _init_patterns(self) -> Dict[str, re.Pattern]:
        """Инициализация regex паттернов"""
        return {
            'strong_signal': re.compile(
                r'#(?P<ticker>[A-Z]+)\s#StrongSignal.*?'
                r'(?P<exchange>BINANCE|BYBIT|MEXC|BATS).*?'
                r'T(?P<hour>\d+):(?P<min>\d+):(?P<sec>\d+)\sUTC.*?'
                r'\*\*Ticker:\*\*\s(?P<ticker2>[A-Z]+).*?\*\*(?P<timeframe>\w+)\s*\*\*.*?'
                r'(🔴🔴|🟢🟢)\*\*(?P<pattern_dir>↑|↓)\s(?P<pattern>.*?)\s(↓|↑)\*\*\s+(?P<pattern_strength>[\d.]+)%.*?'
                r'\*\*RSI:\*\*\s(?P<rsi>[\d.]+).*?'
                r'(LONG|SHORT)(?:📗|📕).*?'
                r'\*\*Last price:\*\*\s(?P<last_price>[\d.]+)',
                re.DOTALL | re.IGNORECASE
            ),
            'medium_signal': re.compile(
                r'#(?P<ticker>[A-Z]+)\s#MediumSignal.*?'
                r'(?P<exchange>BINANCE|BYBIT|MEXC|BATS).*?'
                r'T(?P<hour>\d+):(?P<min>\d+):(?P<sec>\d+)\sUTC.*?'
                r'\*\*Ticker:\*\*\s(?P<ticker2>[A-Z]+).*?\*\*(?P<timeframe>\w+)\s*\*\*.*?'
                r'(🔴|🟢)\*\*(?P<pattern_dir>↑|↓)\s(?P<pattern>.*?)\s(↓|↑)\*\*\s+(?P<pattern_strength>[\d.]+)%.*?'
                r'\*\*RSI:\*\*\s(?P<rsi>[\d.]+).*?'
                r'(LONG|SHORT)(?:📗|📕).*?'
                r'\*\*Last price:\*\*\s(?P<last_price>[\d.]+)',
                re.DOTALL | re.IGNORECASE
            ),
            'sentiment': re.compile(
                r'#(?P<ticker>[A-Z]+)\s#SENTIMENT.*?'
                r'(?P<exchange>BINANCE|BYBIT|MEXC|BATS).*?'
                r'\*\*Day\*\*\s(?P<day_change>-?[\d.]+)%.*?'
                r'\*\*24h\*\*\s(?P<change_24h>-?[\d.]+)%.*?'
                r'\*\*Last price:\*\*\s(?P<last_price>[\d.]+)',
                re.DOTALL | re.IGNORECASE
            ),
            'entry_signal': re.compile(
                r'#(?P<ticker>[A-Z]+).*?'
                r'(🔴|🟢)(?P<exchange>BINANCE|BYBIT|MEXC|BATS).*?'
                r'\*\*Entry:\*\*\s(?P<entry>[\d.]+).*?'
                r'\*\*Targets:\*\*\s(?P<targets>[\d.\s-]+).*?'
                r'\*\*Stop:\*\*\s\*\*0\.5%\*\*\s-\s(?P<stop_05>[\d.]+).*?'
                r'\*\*1%\*\*\s-\s(?P<stop_1>[\d.]+)',
                re.DOTALL | re.IGNORECASE
            ),
            'quick_target_ru': re.compile(
                r'(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z),\s(?P<exchange>BINANCE|BYBIT|MEXC|BATS).*?'
                r'\*\*Тикер:\*\*\s(?P<ticker>[A-Z]+).*?'
                r'\*\*Таймфрейм:\*\*\s(?P<timeframe>\d+)\s*минут.*?'
                r'(?:🟢\s*\*\*НОВАЯ ЦЕЛЬ РОСТА\*\*\s*🟢|🔴\s*\*\*НОВАЯ ЦЕЛЬ СНИЖЕНИЯ\*\*\s*🔴).*?'
                r'\*\*Вход:\*\*\s(?P<entry>[\d.]+).*?'
                r'\*\*Тейки:\*\*\s(?P<targets>[\d.\s-]+)',
                re.DOTALL | re.IGNORECASE
            ),
            'funding_rate': re.compile(
                r'⚡️\s*\*\*Сигнал по фандингу\s*\((?P<exchange>BYBIT|MEXC)\)\*\*.*?'
                r'🔹\s*\*\*Инструмент:\*\*\s\[(?P<ticker>[A-Z]+)\].*?'
                r'🕒\s*\*\*Время:\*\*\s(?P<day>\d{2})\.(?P<month>\d{2})\.(?P<year>\d{4})\s(?P<hour>\d{2}):(?P<min>\d{2}).*?'
                r'💰\s*\*\*Ставка:\*\*\s(?P<rate>-?[\d.]+)%.*?'
                r'(?:📈\s*Лонги получают|📉\s*Шорты получают).*?'
                r'(?:🟢\s*Открывать\s*(ЛОНГ|LONG)|🔴\s*Открывать\s*(ШОРТ|SHORT))',
                re.DOTALL | re.IGNORECASE
            )
        }
    
    def parse(self, raw_message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Парсинг сырого сообщения"""
        text = raw_message.get('text', '')
        if not text:
            return None
        
        # Определяем тип сигнала
        signal_type, match = self._detect_signal_type(text)
        if not signal_type:
            return None
        
        # Парсим в зависимости от типа
        parsed = self._parse_by_type(signal_type, match, raw_message)
        if not parsed:
            return None
        
        # Нормализуем
        normalized = self._normalize(parsed)
        
        # Валидируем
        if not self._validate(normalized):
            return None
        
        return normalized
    
    def _detect_signal_type(self, text: str) -> tuple:
        """Определение типа сигнала"""
        if '#StrongSignal' in text:
            match = self.patterns['strong_signal'].search(text)
            return (SignalType.STRONG_SIGNAL, match) if match else (None, None)
        
        if '#MediumSignal' in text:
            match = self.patterns['medium_signal'].search(text)
            return (SignalType.MEDIUM_SIGNAL, match) if match else (None, None)
        
        if '#SENTIMENT' in text:
            match = self.patterns['sentiment'].search(text)
            return (SignalType.SENTIMENT, match) if match else (None, None)
        
        if '**Entry:**' in text and '**Targets:**' in text:
            match = self.patterns['entry_signal'].search(text)
            return (SignalType.ENTRY_SIGNAL, match) if match else (None, None)
        
        if 'НОВАЯ ЦЕЛЬ' in text:
            match = self.patterns['quick_target_ru'].search(text)
            return (SignalType.QUICK_TARGET, match) if match else (None, None)
        
        if 'Сигнал по фандингу' in text:
            match = self.patterns['funding_rate'].search(text)
            return (SignalType.FUNDING_RATE, match) if match else (None, None)
        
        return (None, None)
    
    def _parse_by_type(self, signal_type: SignalType, match: re.Match, 
                       raw_message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Парсинг по типу сигнала"""
        groups = match.groupdict()
        
        base = {
            'signal_id': str(uuid.uuid4()),
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'source': {
                'channel': raw_message.get('chat_title', ''),
                'channel_id': raw_message.get('chat_id'),
                'sender_name': raw_message.get('sender_name'),
                'message_id': raw_message.get('message_id'),
                'message_date': raw_message.get('message_date'),
                'original_text': raw_message.get('text', ''),
                'has_media': raw_message.get('has_media', False),
                'media': self._parse_media(raw_message)
            },
            'signal': {
                'type': signal_type.value,
                'priority': self._get_priority(signal_type),
                'instrument': {
                    'ticker': groups.get('ticker') or groups.get('ticker2'),
                    'exchange': groups.get('exchange', '').upper()
                }
            }
        }
        
        # Дополняем в зависимости от типа
        if signal_type in [SignalType.STRONG_SIGNAL, SignalType.MEDIUM_SIGNAL]:
            base['signal'].update(self._parse_directional_signal(groups))
        
        elif signal_type == SignalType.SENTIMENT:
            base['signal'].update(self._parse_sentiment(groups))
        
        elif signal_type == SignalType.ENTRY_SIGNAL:
            base['signal'].update(self._parse_entry_signal(groups))
        
        elif signal_type == SignalType.QUICK_TARGET:
            base['signal'].update(self._parse_quick_target(groups))
        
        elif signal_type == SignalType.FUNDING_RATE:
            base['signal'].update(self._parse_funding_rate(groups))
        
        return base
    
    def _parse_directional_signal(self, groups: Dict[str, str]) -> Dict[str, Any]:
        """Парсинг Strong/Medium сигнала"""
        direction = 'long' if '🟢' in groups.get('pattern_dir', '') else 'short'
        strength = 'strong' if '🔴🔴' in groups.get('original_text', '') or '🟢🟢' in groups.get('original_text', '') else 'medium'
        
        pattern_map = {
            'TREND Reversal': 'trend_reversal',
            'OB Reversal': 'ob_reversal',
            'OS Reversal': 'os_reversal'
        }
        
        rsi = float(groups.get('rsi', 50))
        rsi_signal = 'overbought' if rsi > 70 else 'oversold' if rsi < 30 else 'neutral'
        
        return {
            'instrument': {
                'ticker': groups.get('ticker'),
                'exchange': groups.get('exchange', '').upper(),
                'asset_type': 'crypto'
            },
            'timing': {
                'timeframe': self._normalize_timeframe(groups.get('timeframe', '')),
                'signal_time': self._parse_vasya_time(groups)
            },
            'direction': {
                'side': direction,
                'strength': strength,
                'pattern': pattern_map.get(groups.get('pattern', ''), 'unknown'),
                'pattern_strength': float(groups.get('pattern_strength', 0)),
                'pattern_direction': 'down' if groups.get('pattern_dir') == '↑' else 'up'
            },
            'indicators': {
                'rsi': rsi,
                'rsi_signal': rsi_signal
            },
            'trade_setup': {
                'current_price': float(groups.get('last_price', 0))
            }
        }
    
    def _parse_sentiment(self, groups: Dict[str, str]) -> Dict[str, Any]:
        """Парсинг SENTIMENT сигнала"""
        return {
            'instrument': {
                'ticker': groups.get('ticker'),
                'exchange': groups.get('exchange', '').upper(),
                'asset_type': 'crypto'
            },
            'direction': {
                'side': 'neutral',
                'strength': 'weak'
            },
            'indicators': {
                'sentiment': {
                    'day_change': float(groups.get('day_change', 0)),
                    'change_24h': float(groups.get('change_24h', 0))
                }
            }
        }
    
    def _parse_entry_signal(self, groups: Dict[str, str]) -> Dict[str, Any]:
        """Парсинг Entry сигнала"""
        direction = 'short' if '🔴' in groups.get('original_text', '') else 'long'
        targets_str = groups.get('targets', '')
        targets = [float(x.strip()) for x in re.findall(r'[\d.]+', targets_str)]
        
        return {
            'instrument': {
                'ticker': groups.get('ticker'),
                'exchange': groups.get('exchange', '').upper(),
                'asset_type': 'crypto'
            },
            'direction': {
                'side': direction,
                'strength': 'medium'
            },
            'trade_setup': {
                'entry_price': float(groups.get('entry', 0)),
                'current_price': float(groups.get('entry', 0)),
                'targets': targets,
                'stop_loss': {
                    'stop_0_5': float(groups.get('stop_05', 0)),
                    'stop_1': float(groups.get('stop_1', 0))
                }
            }
        }
    
    def _parse_quick_target(self, groups: Dict[str, str]) -> Dict[str, Any]:
        """Парсинг Quick Target (RU)"""
        direction = 'long' if 'РОСТА' in groups.get('original_text', '') else 'short'
        targets_str = groups.get('targets', '')
        targets = [float(x.strip()) for x in re.findall(r'[\d.]+', targets_str)]
        
        return {
            'instrument': {
                'ticker': groups.get('ticker'),
                'exchange': groups.get('exchange', '').upper(),
                'asset_type': 'crypto'
            },
            'timing': {
                'timeframe': f"{groups.get('timeframe', '5')}min",
                'signal_time': groups.get('timestamp', '')
            },
            'direction': {
                'side': direction,
                'strength': 'medium'
            },
            'trade_setup': {
                'entry_price': float(groups.get('entry', 0)),
                'current_price': float(groups.get('entry', 0)),
                'targets': targets
            }
        }
    
    def _parse_funding_rate(self, groups: Dict[str, str]) -> Dict[str, Any]:
        """Парсинг Funding Rate сигнала"""
        rate = float(groups.get('rate', 0))
        receiver = 'longs' if rate < 0 else 'shorts'
        recommended = 'long' if rate < 0 else 'short'
        
        return {
            'instrument': {
                'ticker': groups.get('ticker'),
                'exchange': groups.get('exchange', '').upper(),
                'asset_type': 'crypto'
            },
            'timing': {
                'signal_time': f"{groups.get('year')}-{groups.get('month')}-{groups.get('day')}T{groups.get('hour')}:{groups.get('min')}:00Z"
            },
            'funding_info': {
                'funding_rate': rate,
                'funding_time': f"{groups.get('year')}-{groups.get('month')}-{groups.get('day')}T{groups.get('hour')}:{groups.get('min')}:00Z",
                'receiver': receiver,
                'recommended_action': recommended
            }
        }
    
    def _normalize(self, parsed: Dict[str, Any]) -> Dict[str, Any]:
        """Нормализация данных"""
        # Нормализация таймфреймов
        if 'timing' in parsed['signal'] and 'timeframe' in parsed['signal']['timing']:
            parsed['signal']['timing']['timeframe'] = self._normalize_timeframe(
                parsed['signal']['timing']['timeframe']
            )
        
        # Расчёт confidence score
        parsed['signal']['confidence'] = self._calculate_confidence(parsed['signal'])
        
        # Метаданные
        parsed['metadata'] = {
            'parser_version': '1.0.0',
            'processing_time_ms': 15,
            'language': self._detect_language(parsed['source']['original_text']),
            'tags': self._generate_tags(parsed['signal']),
            'warnings': []
        }
        
        return parsed
    
    def _normalize_timeframe(self, tf: str) -> str:
        """Нормализация таймфрейма"""
        tf = tf.lower().strip()
        
        mapping = {
            '1min': '1min', '1 min': '1min', '1 minute': '1min',
            '5min': '5min', '5 min': '5min', '5 минут': '5min',
            '15min': '15min', '15 min': '15min', '15 минут': '15min',
            '30min': '30min', '30 min': '30min', '30 минут': '30min',
            '1h': '1h', '1 hour': '1h', '1 час': '1h',
            '4h': '4h', '4 hour': '4h', '4 часа': '4h',
            '12h': '12h', '12 hour': '12h', '12 часов': '12h',
            '1d': '1d', '1 day': '1d', 'D': '1d', 'daily': '1d'
        }
        
        return mapping.get(tf, tf)
    
    def _get_priority(self, signal_type: SignalType) -> int:
        """Получение приоритета сигнала"""
        priorities = {
            SignalType.STRONG_SIGNAL: 1,
            SignalType.MEDIUM_SIGNAL: 2,
            SignalType.ENTRY_SIGNAL: 2,
            SignalType.QUICK_TARGET: 2,
            SignalType.FUNDING_RATE: 3,
            SignalType.SENTIMENT: 4
        }
        return priorities.get(signal_type, 5)
    
    def _calculate_confidence(self, signal: Dict[str, Any]) -> Dict[str, Any]:
        """Расчёт уверенности сигнала"""
        score = 50  # Базовый score
        factors = []
        
        # Факторы на основе типа сигнала
        if signal['type'] == 'strong_signal':
            score += 20
            factors.append("Сильный сигнал")
        
        # RSI факторы
        if 'indicators' in signal and 'rsi' in signal['indicators']:
            rsi = signal['indicators']['rsi']
            if rsi > 70 or rsi < 30:
                score += 10
                factors.append(f"RSI в экстремальной зоне ({rsi})")
        
        # Паттерн факторы
        if 'direction' in signal and 'pattern_strength' in signal['direction']:
            strength = signal['direction']['pattern_strength']
            if strength > 50:
                score += 15
                factors.append(f"Сильный паттерн ({strength}%)")
            elif strength < 30:
                score -= 10
                factors.append(f"Слабый паттерн ({strength}%)")
        
        # Ограничиваем 0-100
        score = max(0, min(100, score))
        
        return {
            'score': score,
            'factors': factors
        }
    
    def _validate(self, signal: Dict[str, Any]) -> bool:
        """Валидация сигнала"""
        # Проверка обязательных полей
        required = ['signal_id', 'timestamp', 'source', 'signal']
        if not all(k in signal for k in required):
            return False
        
        if 'instrument' not in signal.get('signal', {}):
            return False
        
        instrument = signal['signal']['instrument']
        if not instrument.get('ticker') or not instrument.get('exchange'):
            return False
        
        return True
    
    def _parse_media(self, raw_message: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Парсинг медиа"""
        media = []
        if raw_message.get('has_media'):
            files = raw_message.get('files', [])
            for f in files:
                media.append({
                    'file_id': f.get('file_id'),
                    'file_type': f.get('file_type'),
                    'file_name': f.get('file_name'),
                    'file_size': f.get('file_size')
                })
        return media
    
    def _detect_language(self, text: str) -> str:
        """Определение языка текста"""
        cyrillic = re.search(r'[\u0400-\u04FF]', text)
        return 'ru' if cyrillic else 'en'
    
    def _generate_tags(self, signal: Dict[str, Any]) -> List[str]:
        """Генерация тегов"""
        tags = []
        
        # Тип сигнала
        tags.append(signal.get('type', 'unknown'))
        
        # Тип актива
        asset_type = signal.get('instrument', {}).get('asset_type', 'crypto')
        tags.append(asset_type)
        
        # Биржа
        exchange = signal.get('instrument', {}).get('exchange', '').lower()
        if exchange:
            tags.append(exchange)
        
        # Направление
        direction = signal.get('direction', {}).get('side')
        if direction:
            tags.append(direction)
        
        return tags
```

---

## 🚀 Интеграция с WebSocket

### Сервер (FastAPI + WebSockets)

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
    
    def disconnect(self, client_id: str):
        del self.active_connections[client_id]
    
    async def broadcast_signal(self, signal: dict):
        """Отправка сигнала всем клиентам"""
        message = {
            "type": "signal",
            "action": "new_signal",
            "payload": signal,
            "server_timestamp": datetime.utcnow().isoformat() + 'Z'
        }
        
        disconnected = []
        for client_id, connection in self.active_connections.items():
            try:
                await connection.send_json(message)
            except:
                disconnected.append(client_id)
        
        for client_id in disconnected:
            self.disconnect(client_id)

manager = ConnectionManager()
parser = SignalParser()

@app.websocket("/ws/signals")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Обработка сообщений от клиента (ack, subscription и т.д.)
    except WebSocketDisconnect:
        manager.disconnect(client_id)

async def process_telegram_message(raw_message: dict):
    """Обработка сообщения из Telegram"""
    signal = parser.parse(raw_message)
    if signal:
        await manager.broadcast_signal(signal)
```

### Клиент (пример подписки)

```python
import asyncio
import websockets

async def signal_client():
    uri = "ws://localhost:8000/ws/signals?client_id=trader_bot_1"
    async with websockets.connect(uri) as websocket:
        while True:
            try:
                message = await websocket.recv()
                data = json.loads(message)
                
                if data['type'] == 'signal':
                    signal = data['payload']
                    
                    # Обработка сигнала
                    if signal['signal']['type'] == 'strong_signal':
                        print(f"🚨 STRONG SIGNAL: {signal['signal']['instrument']['ticker']}")
                        print(f"   Direction: {signal['signal']['direction']['side']}")
                        print(f"   Confidence: {signal['signal']['confidence']['score']}%")
                        
                        # Торговая логика здесь
                        await execute_trade(signal)
                    
                    # Отправка подтверждения
                    ack = {
                        "type": "ack",
                        "signal_id": signal['signal_id'],
                        "received_at": datetime.utcnow().isoformat() + 'Z'
                    }
                    await websocket.send(json.dumps(ack))
                    
            except websockets.exceptions.ConnectionClosed:
                break

async def execute_trade(signal: dict):
    """Логика торговли"""
    # Интеграция с биржей
    pass

asyncio.run(signal_client())
```

---

## ✅ Чек-лист перед запуском

- [ ] Парсер распознаёт все 6 типов сигналов
- [ ] JSON Schema валидация проходит
- [ ] Таймфреймы нормализуются корректно
- [ ] Время преобразуется в ISO8601 UTC
- [ ] Confidence score рассчитывается
- [ ] WebSocket отправляет сигналы клиентам
- [ ] Клиенты получают и подтверждают (ack)
- [ ] Фильтрация невалидных сигналов работает
- [ ] Медиафайлы обрабатываются
- [ ] Логи парсера пишутся

---

## 📊 Метрики

| Метрика | Значение |
|---------|----------|
| Точность парсинга | >95% |
| Время обработки | <50ms |
| Поддержка типов | 6 типов |
| Поддержка языков | EN, RU |
| WebSocket задержка | <100ms |
