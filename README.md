# 🚀 UniSignal Relay

**Промежуточный шлюз для нормализации и трансляции криптовалютных сигналов из Telegram**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791.svg)](https://www.postgresql.org/)

UniSignal Relay подключается к [Telegrab](https://github.com/JeBance/telegrab), получает сообщения из криптовалютных Telegram-каналов, нормализует их в структурированный формат и транслирует авторизованным клиентам через WebSocket.

---

## 📋 Оглавление

- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Быстрый старт](#-быстрый-старт)
- [Установка](#-установка)
- [Конфигурация](#-конфигурация)
- [Веб-интерфейс](#-веб-интерфейс)
- [API Документация](#-api-документация)
- [WebSocket API](#-websocket-api)
- [Парсер сигналов](#-парсер-сигналов)
- [База данных](#-база-данных)
- [Разработка](#-разработка)
- [Тестирование](#-тестирование)
- [Структура проекта](#-структура-проекта)
- [Производительность](#-производительность)
- [Безопасность](#-безопасность)
- [Управление сервисом](#-управление-сервисом-systemd)
- [Troubleshooting](#-troubleshooting)
- [Лицензия](#-лицензия)

---

## ✨ Возможности

### Основные
- 🔌 **Подключение к Telegrab** — постоянное WebSocket-соединение с автоматическим переподключением
- 📡 **Фильтрация каналов** — белый список отслеживаемых Telegram-каналов
- 🧠 **Умный парсер** — извлечение тикера, направления (LONG/SHORT), цен входа/выхода
- 💾 **Дедупликация** — защита от дубликатов при переподключении
- 🔄 **Буферизация** — сохранение сообщений при недоступности БД

### Безопасность
- 🔐 **Аутентификация клиентов** — API-ключи для доступа к WebSocket
- 🔑 **Разделение доступа** — разные права для админа и клиентов
- 🛡️ **Middleware защита** — проверка ключей на каждом запросе

### Интерфейс
- 🖥️ **Веб-интерфейс** — современный Dashboard на React
- 📊 **Статистика** — реальная статистика сообщений и сигналов
- 📡 **Живые сигналы** — трансляция в реальном времени через WebSocket
- 👥 **Управление клиентами** — создание и отзыв API-ключей
- 📺 **Управление каналами** — добавление/удаление каналов

### Надёжность
- 📝 **Логирование** — структурированные логи через Pino
- ✅ **Health checks** — мониторинг состояния системы
- 🗄️ **Миграции БД** — автоматическое применение при запуске

---

## 🏗 Архитектура

```
┌─────────────────┐      WebSocket       ┌──────────────────────┐
│    Telegrab     │ ───────────────────► │   UniSignal Relay    │
│   (Upstream)    │    ws://server:3000  │      (Port 3001)     │
└─────────────────┘                      └──────────┬───────────┘
                                                    │
                      ┌─────────────────────────────┼─────────────────────────────┐
                      │                             │                             │
                ┌─────▼──────┐            ┌────────▼────────┐           ┌────────▼────────┐
                │   Admin    │            │    Client       │           │   PostgreSQL    │
                │  HTTP API  │            │   WebSocket     │           │    Database     │
                │  /admin/*  │            │      /ws        │           │  (messages,     │
                └────────────┘            └─────────────────┘           │   channels,     │
                                                                        │    clients)     │
                                                                        └─────────────────┘
```

### Поток данных

```
1. Telegrab → new_message событие
         ↓
2. UniSignal → проверка канала в белом списке
         ↓
3. SignalParser → извлечение данных (тикер, направление, цены)
         ↓
4. MessageProcessor → дедупликация по unique_hash
         ↓
5. PostgreSQL → сохранение в БД
         ↓
6. Client WebSocket → трансляция авторизованным клиентам
```

### Компоненты системы

| Компонент | Описание | Порт |
|-----------|----------|------|
| **Telegrab WS** | Upstream WebSocket | 3000 |
| **UniSignal HTTP** | Admin API + Web UI | 3001 |
| **UniSignal WS** | Client WebSocket | 3001/ws |
| **PostgreSQL** | База данных | 5432 |

---

## 🚀 Быстрый старт

### Требования

- **Docker** и **Docker Compose** (для production)
- **Node.js 18+** (для локальной разработки)
- **PostgreSQL 15+** (или Docker)
- **Telegrab** (запущенный и настроенный)

### 1. Клонирование репозитория

```bash
git clone https://github.com/JeBance/UniSignal.git
cd UniSignal
```

### 2. Настройка окружения

```bash
# Копируем пример конфигурации
cp .env.example .env

# Редактируем .env
nano .env  # или ваш любимый редактор
```

### 3. Запуск через Docker Compose

```bash
# Запуск всех сервисов
docker compose up -d

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f app
```

### 4. Проверка работоспособности

```bash
# Health check
curl http://localhost:3001/health

# Ожидаемый ответ:
# {
#   "status": "ok",
#   "service": "UniSignal Relay",
#   "timestamp": "2026-02-28T15:00:00.000Z",
#   "checks": { "database": "ok" }
# }
```

### 5. Первый вход

1. Откройте **http://localhost:3001/ui**
2. Введите `ADMIN_MASTER_KEY` из `.env`
3. Создайте первого клиента в разделе "Клиенты"
4. Добавьте каналы в разделе "Каналы"

---

## 📦 Установка

### Вариант 1: Docker Compose (Recommended)

**Преимущества:**
- ✅ Изолированное окружение
- ✅ Автоматические миграции
- ✅ Простое развёртывание
- ✅ Встроенный PostgreSQL

```bash
# 1. Настроить .env
cp .env.example .env
# Отредактировать TELEGRAB_WS_URL, TELEGRAB_API_KEY, ADMIN_MASTER_KEY

# 2. Запустить
docker compose up -d

# 3. Проверить
curl http://localhost:3001/health
```

### Вариант 2: Локальная установка (для разработки)

```bash
# 1. Установка зависимостей
npm install
cd frontend && npm install && cd ..

# 2. Настроить .env
cp .env.example .env

# 3. Запустить PostgreSQL (локально или Docker)
docker run -d --name postgres \
  -e POSTGRES_USER=unisignal \
  -e POSTGRES_PASSWORD=unisignal_password \
  -e POSTGRES_DB=unisignal \
  -p 5432:5432 \
  postgres:15-alpine

# 4. Применить миграции
npm run db:migrate:up

# 5. Запустить в режиме разработки
npm run dev

# 6. Запустить frontend (в отдельном терминале)
cd frontend && npm run dev
```

### Вариант 3: Production сборка

```bash
# 1. Собрать проект
npm run build
cd frontend && npm run build && cd ..

# 2. Запустить
npm start
```

---

## ⚙️ Конфигурация

### Переменные окружения

| Переменная | Обязательна | Описание | Пример | По умолчанию |
|------------|-------------|----------|--------|--------------|
| `PORT` | Нет | Порт HTTP/WebSocket | `3001` | `3001` |
| `LOG_LEVEL` | Нет | Уровень логирования | `debug`, `info`, `warn`, `error` | `info` |
| `ADMIN_MASTER_KEY` | **Да** | Мастер-ключ админа | `super_secret_key` | — |
| `TELEGRAB_WS_URL` | **Да** | URL WebSocket Telegrab | `ws://localhost:3000/ws` | — |
| `TELEGRAB_API_KEY` | **Да** | API-ключ Telegrab | `tg_abc123...` | — |
| `DATABASE_URL` | **Да** | Connection string PostgreSQL | `postgresql://user:pass@host:5432/db` | — |

### Пример .env

```bash
# App
PORT=3001
LOG_LEVEL=info
ADMIN_MASTER_KEY=us_f10125b9443d4f5189e69108112c34d9

# Telegrab
TELEGRAB_WS_URL=ws://localhost:3000/ws
TELEGRAB_API_KEY=tg_your_api_key_here

# Database (локально)
DATABASE_URL=postgresql://unisignal:unisignal_password@localhost:5432/unisignal

# Database (Docker)
# DATABASE_URL=postgresql://unisignal:unisignal_password@db:5432/unisignal
```

### Конфигурация парсеров

Файл `config/parsers.yaml` содержит паттерны для извлечения данных:

```yaml
channels:
  # Шаблон по умолчанию
  default:
    direction:
      long: ["⬆️", "🟢", "🚀", "Long", "BUY"]
      short: ["⬇️", "🔴", "📉", "Short", "SELL"]
    ticker:
      pattern: "/\\b([A-Z]{3,6})(USDT|BTC|ETH)\\b/"
      group: 1
    entry:
      pattern: "/(?:Entry|Вход)[:\\s]*([0-9.,]+)/i"
      group: 1
    stop_loss:
      pattern: "/(?:SL|Stop)[:\\s]*([0-9.,]+)/i"
      group: 1
    take_profit:
      pattern: "/(?:TP|Target)[:\\s]*([0-9.,]+)/i"
      group: 1

  # Специфичная конфигурация для канала
  2678035223:  # chat_id канала
    direction:
      long: ["🟢", "НОВАЯ ЦЕЛЬ РОСТА"]
      short: ["🔴", "НОВАЯ ЦЕЛЬ СНИЖЕНИЯ"]
    ticker:
      pattern: "/\\*\\*Ticker:\\*\\*\\s*([A-Z]{3,6})/i"
      group: 1
```

---

## 🖥️ Веб-интерфейс

### Доступ

| Режим | URL |
|-------|-----|
| **Docker** | http://localhost:3001/ui |
| **Dev** | http://localhost:3000 |

### Разделы

#### 📊 Dashboard
- Общая статистика сообщений
- Количество LONG/SIGNAL сигналов
- Активные каналы и клиенты
- Статистика за сегодня

#### 📡 Сигналы
- Живая трансляция сигналов
- Фильтры по типу, направлению, бирже
- Расширенные фильтры (parsedSignal)
- Экспорт в CSV/JSON
- Пресеты фильтров

#### 👥 Клиенты (Admin only)
- Создание новых API-ключей
- Просмотр активных клиентов
- Отзыв ключей

#### 📺 Каналы (Admin only)
- Добавление каналов в белый список
- Включение/выключение каналов
- Загрузка истории из Telegrab
- Очистка истории канала

---

## 🔧 API Документация

### Базовый URL

```
http://localhost:3001
```

### Аутентификация

| Роль | Заголовок | Значение |
|------|-----------|----------|
| **Admin** | `X-Admin-Key` | `ADMIN_MASTER_KEY` |
| **Client** | `X-API-Key` | API-ключ клиента |

### Public Endpoints

#### GET /health
Health check endpoint.

```bash
curl http://localhost:3001/health
```

**Ответ:**
```json
{
  "status": "ok",
  "service": "UniSignal Relay",
  "timestamp": "2026-02-28T15:00:00.000Z",
  "checks": {
    "database": "ok"
  }
}
```

#### GET /api/auth/validate
Проверка ключа аутентификации.

```bash
curl http://localhost:3001/api/auth/validate \
  -H "X-Admin-Key: your_admin_key"
```

**Ответ:**
```json
{
  "valid": true,
  "role": "admin"
}
```

#### GET /api/stats
Статистика (доступно admin и client).

```bash
curl http://localhost:3001/api/stats \
  -H "X-API-Key: your_client_api_key"
```

**Ответ:**
```json
{
  "messages": {
    "total": 33864,
    "today": 65,
    "with_ticker": 29081,
    "long_count": 12683,
    "short_count": 14655
  },
  "channels": {
    "active": 3
  },
  "clients": {
    "total": 2,
    "active": 2
  }
}
```

#### GET /api/signals
Получение сигналов (доступно admin и client).

**Параметры:**
- `limit` (optional): количество сигналов (по умолчанию 50)
- `since` (optional): timestamp, сигналы новее которого

```bash
# Последние 50 сигналов
curl "http://localhost:3001/api/signals?limit=50" \
  -H "X-API-Key: your_client_api_key"

# Сигналы с определённого времени
curl "http://localhost:3001/api/signals?limit=100&since=1772287207" \
  -H "X-API-Key: your_client_api_key"
```

### Admin Endpoints

#### POST /admin/clients
Создать нового клиента.

```bash
curl -X POST http://localhost:3001/admin/clients \
  -H "X-Admin-Key: your_admin_key"
```

**Ответ:**
```json
{
  "id": "uuid-...",
  "api_key": "usk_fb19100de8b51858dbb7ee0c741721e378fcc72565425fa6",
  "is_active": true,
  "created_at": "2026-02-28T15:00:00.000Z"
}
```

#### GET /admin/clients
Получить список всех клиентов.

```bash
curl http://localhost:3001/admin/clients \
  -H "X-Admin-Key: your_admin_key"
```

#### DELETE /admin/clients/:id
Удалить клиента.

```bash
curl -X DELETE http://localhost:3001/admin/clients/<client-id> \
  -H "X-Admin-Key: your_admin_key"
```

#### POST /admin/channels
Добавить канал в белый список.

```bash
curl -X POST http://localhost:3001/admin/channels \
  -H "X-Admin-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": 2678035223,
    "name": "VasyaBTC-Signals 🟢🔴",
    "is_active": true
  }'
```

#### GET /admin/channels
Получить список каналов.

```bash
# Активные каналы
curl http://localhost:3001/admin/channels \
  -H "X-Admin-Key: your_admin_key"

# Все каналы (включая неактивные)
curl "http://localhost:3001/admin/channels?all=true" \
  -H "X-Admin-Key: your_admin_key"
```

#### DELETE /admin/channels/:chatId
Удалить канал.

```bash
curl -X DELETE http://localhost:3001/admin/channels/2678035223 \
  -H "X-Admin-Key: your_admin_key"
```

#### PATCH /admin/channels/:chatId/toggle
Переключить статус канала.

```bash
curl -X PATCH http://localhost:3001/admin/channels/2678035223/toggle \
  -H "X-Admin-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'
```

#### POST /admin/history/load
Загрузить историю из Telegrab.

```bash
curl -X POST http://localhost:3001/admin/history/load \
  -H "X-Admin-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": 2678035223,
    "limit": 1000
  }'
```

**Ответ:**
```json
{
  "success": true,
  "loaded": 1000,
  "saved": 950,
  "duplicates": 50
}
```

#### DELETE /admin/history/:chatId
Очистить историю канала.

```bash
curl -X DELETE http://localhost:3001/admin/history/2678035223 \
  -H "X-Admin-Key: your_admin_key"
```

---

## 🔗 WebSocket API

### Подключение

```
ws://localhost:3001/ws
```

### Аутентификация

После подключения клиент **обязан** отправить сообщение в течение **30 секунд**:

```json
{
  "action": "auth",
  "api_key": "usk_fb19100de8b51858dbb7ee0c741721e378fcc72565425fa6"
}
```

#### Успешная аутентификация

```json
{
  "status": "authenticated",
  "message": "Welcome to UniSignal Relay"
}
```

#### Ошибка аутентификации

```json
{
  "status": "error",
  "message": "Invalid API Key"
}
```

Соединение закрывается с кодом `4002`.

### Форматы сообщений

#### 1. ProcessedMessage (от broadcast)

```json
{
  "type": "signal",
  "data": {
    "id": 317678,
    "channel": "VasyaBTC-Signals 🟢🔴",
    "direction": "LONG",
    "ticker": "BNBUSDT",
    "entry_price": 603.2,
    "stop_loss": 600.18,
    "take_profit": 604.98,
    "content_text": "#BNBUSDT\n🟢BINANCE...",
    "timestamp": 1772287206,
    "parsed_signal": {...}
  }
}
```

#### 2. TradingSignal (от broadcastSignal)

```json
{
  "type": "signal",
  "action": "new_signal",
  "payload": {
    "signal_id": "e45a8f54-39e9-4039-8f33-b8a3badcc0d1",
    "timestamp": "2026-02-28T14:00:07.228Z",
    "source": {
      "channel": "VasyaBTC-Signals 🟢🔴",
      "channel_id": "2678035223",
      "message_id": 17740,
      "original_text": "#BNBUSDT\n🟢BINANCE..."
    },
    "signal": {
      "type": "entry_signal",
      "priority": 2,
      "instrument": {
        "ticker": "BNBUSDT",
        "exchange": "BINANCE",
        "asset_type": "crypto"
      },
      "direction": {
        "side": "long",
        "strength": "medium"
      },
      "trade_setup": {
        "entry_price": 603.2,
        "targets": [604.98, 607.22],
        "stop_loss": {
          "stop_0_5": 600.18,
          "stop_1": 597.17
        }
      },
      "confidence": {
        "score": 75,
        "factors": ["Чёткие уровни входа и выхода", "Указаны стоп-лоссы"]
      }
    }
  },
  "server_timestamp": "2026-02-28T14:00:07.300Z"
}
```

### Пример клиента на JavaScript

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('open', () => {
  console.log('Connected, authenticating...');
  ws.send(JSON.stringify({
    action: 'auth',
    api_key: 'usk_your_api_key'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  if (message.status === 'authenticated') {
    console.log('✅ Authenticated:', message.message);
  } else if (message.type === 'signal') {
    const signal = message.data || message.payload;
    console.log('📡 New signal:', signal);
  }
});

ws.on('close', (code, reason) => {
  console.log(`Disconnected: code=${code}, reason=${reason}`);
  
  // Автопереподключение при ошибках
  if (code === 4001 || code === 4002) {
    console.error('Authentication error, not reconnecting');
    return;
  }
  
  setTimeout(() => {
    console.log('Reconnecting...');
    // Reconnect logic
  }, 5000);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});
```

---

## 🧠 Парсер сигналов

### Поддерживаемые типы сигналов

| Тип | Источник | Приоритет | Описание |
|-----|----------|-----------|----------|
| **Strong Signal** 🔴🔴🟢🟢 | VasyaBTC | 1 | Сильные сигналы с паттернами разворота |
| **Medium Signal** 🔴🟢 | VasyaBTC | 2 | Средние сигналы с техническим анализом |
| **Entry Signal** 📊 | VasyaBTC | 2 | Сигналы с Entry/Targets/Stop |
| **Quick Target** 🎯 | VasyaBTC (RU) | 2 | Быстрые цели на русском |
| **SENTIMENT** 📈 | VasyaBTC | 4 | Сентимент-анализ по таймфреймам |
| **Funding Rate** 💰 | ASFunding_bot | 3 | Ставки фандинга |

### Извлекаемые данные

**Базовые:**
- Тикер (например, `BTCUSDT`)
- Биржа (`BINANCE`, `BYBIT`, `MEXC`, `BATS`)
- Направление (`long`, `short`, `neutral`)

**Технические:**
- Таймфрейм (`5min`, `15min`, `1h`, `4h`, `12h`, `1d`)
- RSI и сигнал (`oversold`, `overbought`, `neutral`)
- Паттерн (`trend_reversal`, `ob_reversal`, `os_reversal`)
- Сила паттерна (%)

**Торговые:**
- Цена входа (`entry_price`)
- Цели (`targets` — массив)
- Стоп-лоссы (`stop_0_5`, `stop_1`)
- Ожидаемая прибыль

**Фандинг:**
- Ставка (%)
- Получатели (`longs`/`shorts`)
- Рекомендация (`long`/`short`)

### Confidence Score

Оценка уверенности от 0 до 100:

**Повышают score:**
- +20 — Strong Signal
- +15 — Паттерн >50%
- +10 — RSI в экстремальной зоне (>70 или <30)
- +10 — Есть Entry/Targets/Stop

**Понижают score:**
- -10 — Паттерн <30%
- -10 — Нет стоп-лосса

---

## 🗄️ База данных

### Схема БД

#### Таблица `clients`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `api_key` | VARCHAR(255) | API-ключ (уникальный) |
| `is_active` | BOOLEAN | Активен ли клиент |
| `created_at` | TIMESTAMPTZ | Дата создания |

#### Таблица `channels`

| Column | Type | Description |
|--------|------|-------------|
| `chat_id` | BIGINT | Primary key (Telegram chat_id) |
| `name` | VARCHAR(255) | Название канала |
| `is_active` | BOOLEAN | Активен ли канал |
| `created_at` | TIMESTAMPTZ | Дата создания |
| `updated_at` | TIMESTAMPTZ | Дата обновления |

#### Таблица `messages`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `unique_hash` | VARCHAR(255) | Уникальный хэш (дедупликация) |
| `channel_id` | BIGINT | Foreign key → channels |
| `direction` | VARCHAR(10) | LONG/SHORT |
| `ticker` | VARCHAR(50) | Тикер |
| `entry_price` | NUMERIC(20,8) | Цена входа |
| `stop_loss` | NUMERIC(20,8) | Стоп-лосс |
| `take_profit` | NUMERIC(20,8) | Тейк-профит |
| `content_text` | TEXT | Оригинальный текст |
| `original_timestamp` | TIMESTAMPTZ | Время сообщения |
| `created_at` | TIMESTAMPTZ | Дата создания |
| `parsed_signal` | JSONB | Распарсенный сигнал |

### Миграции

```bash
# Применить все миграции
npm run db:migrate:up

# Откатить последнюю миграцию
npm run db:migrate:down

# Переделать последнюю миграцию
npm run db:migrate:redo

# Создать новую миграцию
npm run db:migrate create my_migration
```

---

## 🛠 Разработка

### Локальная разработка

```bash
# 1. Установка зависимостей
npm install
cd frontend && npm install && cd ..

# 2. Запуск backend (hot reload)
npm run dev

# 3. Запуск frontend (в отдельном терминале)
cd frontend && npm run dev

# 4. Доступ к интерфейсу
# http://localhost:3000 (Vite dev server)
```

### Docker разработка

```bash
# 1. Создать override файл
cp docker-compose.override.example docker-compose.override.yml

# 2. Отредактировать TELEGRAB_API_KEY

# 3. Запустить
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d

# 4. Логи
docker compose logs -f app
```

### Сборка

```bash
# Backend
npm run build

# Frontend
cd frontend && npm run build

# Production запуск
npm start
```

---

## ✅ Тестирование

```bash
# Запуск всех тестов
npm test

# Запуск в режиме watch
npm run test:watch

# Coverage (будущая функция)
npm run test:coverage
```

### Структура тестов

```
tests/
├── admin-api.test.ts      # Тесты Admin HTTP API
├── client-ws.test.ts      # Тесты Client WebSocket
└── parser.test.ts         # Тесты SignalParser
```

---

## 📁 Структура проекта

```
UniSignal/
├── src/
│   ├── index.ts                    # Entry point
│   ├── config/
│   │   └── parsers.yaml            # Конфигурация парсеров
│   ├── db/
│   │   ├── connection.ts           # Подключение к PostgreSQL
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.ts
│   │   │   └── 002_add_parsed_signal_column.ts
│   │   └── repositories/
│   │       ├── channel-repository.ts
│   │       ├── client-repository.ts
│   │       └── message-repository.ts
│   ├── services/
│   │   ├── admin-api.ts            # HTTP Admin API
│   │   ├── buffer.ts               # In-memory буфер
│   │   ├── client-ws.ts            # Downstream WebSocket
│   │   ├── message-processor.ts    # Обработчик сообщений
│   │   ├── signal-parser.ts        # Парсер сигналов
│   │   ├── telegrab-history.ts     # Загрузка истории
│   │   └── telegrab-ws.ts          # Upstream Telegrab WS
│   └── utils/
│       └── logger.ts               # Pino логгер
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── unisignal.ts        # API клиент
│   │   ├── components/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Signals.tsx
│   │   │   ├── Clients.tsx
│   │   │   └── Channels.tsx
│   │   ├── contexts/
│   │   │   ├── ThemeContext.tsx
│   │   │   ├── ToastContext.tsx
│   │   │   └── WebSocketContext.tsx
│   │   ├── services/
│   │   │   └── signals-db.ts       # IndexedDB
│   │   └── App.tsx
│   ├── public/
│   └── package.json
├── tests/
│   ├── admin-api.test.ts
│   ├── client-ws.test.ts
│   └── parser.test.ts
├── config/
│   └── parsers.yaml
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📊 Производительность

### Метрики

| Метрика | Значение |
|---------|----------|
| **Сообщений в БД** | ~33,864 |
| **Сообщений в день** | ~65 |
| **Время обработки** | < 10ms |
| **WebSocket задержка** | < 100ms |

### Оптимизация

- ✅ Индексы БД на `unique_hash`, `channel_id`, `ticker`
- ✅ Дедупликация на уровне БД (ON CONFLICT)
- ✅ Буферизация при недоступности БД
- ✅ Connection pooling PostgreSQL (max 20)

---

## 🔒 Безопасность

### Рекомендации

1. **Смените ADMIN_MASTER_KEY** перед production
2. **Используйте HTTPS** в production
3. **Ограничьте доступ** к порту 3001 фаерволом
4. **Регулярно обновляйте** зависимости
5. **Мониторьте логи** на предмет подозрительной активности

### Уязвимости

Проверка уязвимостей:

```bash
npm audit
npm audit fix
```

---

## 🛠 Управление сервисом (systemd)

### Быстрые команды

```bash
# Проверка статуса
unisignal status

# Просмотр логов
unisignal logs

# Логи в реальном времени
unisignal follow

# Проверка Health endpoint
unisignal health

# Перезапуск
unisignal restart

# Остановка/запуск
unisignal stop
unisignal start
```

### Полные команды systemctl

```bash
# Статус сервиса
systemctl status unisignal

# Управление
sudo systemctl start unisignal
sudo systemctl stop unisignal
sudo systemctl restart unisignal

# Автозапуск
sudo systemctl enable unisignal  # включить
sudo systemctl disable unisignal # отключить

# Логи
journalctl -u unisignal -f       # follow
journalctl -u unisignal -n 100   # последние 100 строк
```

### Файлы сервиса

| Файл | Назначение |
|------|------------|
| `/etc/systemd/system/unisignal.service` | systemd unit файл |
| `/root/git/UniSignal/unisignal.service` | исходный файл (git) |
| `/usr/local/bin/unisignal` | алиас для управления |
| `/root/git/UniSignal/unisignalctl.sh` | скрипт управления |

---

## 🔧 Troubleshooting

### Сервер не запускается

```bash
# Проверьте логи
docker compose logs app

# Проверьте переменные окружения
cat .env

# Проверьте подключение к БД
docker compose exec db pg_isready -U unisignal
```

### WebSocket не подключается

1. Проверьте API-ключ клиента
2. Убедитесь, что клиент активен
3. Проверьте логи сервера
4. Проверьте фаервол

### Сигналы не приходят

1. Проверьте, что каналы активны:
   ```bash
   curl http://localhost:3001/admin/channels \
     -H "X-Admin-Key: your_key"
   ```

2. Проверьте подключение к Telegrab:
   ```bash
   docker compose logs app | grep Telegrab
   ```

3. Проверьте логи парсера:
   ```bash
   docker compose logs app | grep "Парсер"
   ```

### Ошибки миграции

```bash
# Принудительно применить миграции
docker compose exec app npx node-pg-migrate up
```

---

## 📝 Лицензия

MIT License - см. [LICENSE](LICENSE) файл.

---

## 👤 Автор

**JeBance**

- GitHub: [@JeBance](https://github.com/JeBance)
- Проект: [UniSignal](https://github.com/JeBance/UniSignal)

---

## 🤝 Contributing

Pull requests приветствуются! Для больших изменений пожалуйста откройте Issue сначала.

### Процесс

1. Fork репозиторий
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

---

## 📈 Roadmap

- [ ] Добавить GraphQL API
- [ ] Интеграция с биржами для автоматической торговли
- [ ] Уведомления в Telegram/Discord
- [ ] Backtesting сигналов
- [ ] Мобильное приложение

---

*Последнее обновление: 2026-02-28*
