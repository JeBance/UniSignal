#!/usr/bin/env python3
"""
Тестовый скрипт для проверки WebSocket-соединения с Telegrab.
Подключается к ws://194.87.214.40:3000/ws, логирует сообщения в консоль и файл.
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path

import websockets

# Конфигурация
TELEGRAB_WS_URL = "ws://194.87.214.40:3000/ws"
PING_INTERVAL = 30  # секунд
RECONNECT_DELAY = 5  # секунд
LOG_FILE = Path(__file__).parent / "telegrab_messages.log"

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def format_timestamp() -> str:
    """Возвращает текущую временную метку в формате [YYYY-MM-DD HH:MM:SS]."""
    return datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")


def log_message(message: str) -> None:
    """Выводит сообщение в консоль и записывает в файл лога."""
    timestamped = f"{format_timestamp()} {message}"
    print(timestamped)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(timestamped + "\n")


async def ping_handler(websocket: websockets.WebSocketClientProtocol) -> None:
    """Отправляет ping каждые PING_INTERVAL секунд."""
    try:
        while True:
            await asyncio.sleep(PING_INTERVAL)
            try:
                await websocket.ping()
                logger.debug("Ping sent")
            except Exception as e:
                logger.warning(f"Ошибка отправки ping: {e}")
                break
    except asyncio.CancelledError:
        pass


async def message_receiver(websocket: websockets.WebSocketClientProtocol) -> None:
    """Получает и логирует сообщения от сервера."""
    try:
        async for message in websocket:
            log_message(f"RECV: {message}")
    except websockets.ConnectionClosed as e:
        logger.info(f"Соединение закрыто: {e.code} {e.reason}")
        raise
    except Exception as e:
        logger.error(f"Ошибка получения сообщения: {e}")
        raise


async def connect() -> None:
    """Подключается к Telegrab WebSocket с авто-переподключением."""
    while True:
        try:
            logger.info(f"Подключение к {TELEGRAB_WS_URL}...")
            async with websockets.connect(
                TELEGRAB_WS_URL,
                ping_interval=None,  # Отключаем встроенный ping, используем свой
                ping_timeout=10,
            ) as websocket:
                logger.info("Успешное подключение к Telegrab WebSocket")
                log_message("=" * 60)
                log_message("CONNECTED to Telegrab WebSocket")
                log_message("=" * 60)

                # Запускаем отправку ping в фоновом режиме
                ping_task = asyncio.create_task(ping_handler(websocket))
                
                try:
                    # Основной цикл получения сообщений
                    await message_receiver(websocket)
                finally:
                    ping_task.cancel()
                    try:
                        await ping_task
                    except asyncio.CancelledError:
                        pass

        except websockets.exceptions.InvalidStatusCode as e:
            logger.error(f"Ошибка подключения (HTTP {e.status_code}): {e}")
            log_message(f"ERROR: Connection failed with HTTP {e.status_code}")
        except ConnectionRefusedError:
            logger.error("Подключение отклонено сервером")
            log_message("ERROR: Connection refused")
        except OSError as e:
            logger.error(f"Ошибка сети: {e}")
            log_message(f"ERROR: Network error - {e}")
        except Exception as e:
            logger.error(f"Неожиданная ошибка: {e}")
            log_message(f"ERROR: Unexpected error - {e}")

        # Переподключение с задержкой
        log_message(f"Попытка переподключения через {RECONNECT_DELAY} сек...")
        await asyncio.sleep(RECONNECT_DELAY)


async def main() -> None:
    """Точка входа."""
    log_file_path = LOG_FILE.resolve()
    logger.info(f"Лог-файл: {log_file_path}")
    print(f"\n{format_timestamp()} Запуск тестового скрипта Telegrab WebSocket")
    print(f"{format_timestamp()} Логирование в: {log_file_path}")
    print(f"{format_timestamp()} URL: {TELEGRAB_WS_URL}")
    print(f"{format_timestamp()} Интервал ping: {PING_INTERVAL} сек")
    print(f"{format_timestamp()} Задержка переподключения: {RECONNECT_DELAY} сек")
    print("\n" + "=" * 60)
    print("Нажмите Ctrl+C для остановки")
    print("=" * 60 + "\n")

    try:
        await connect()
    except KeyboardInterrupt:
        log_message("\n" + "=" * 60)
        log_message("STOPPED by user (Ctrl+C)")
        log_message("=" * 60)
        logger.info("Скрипт остановлен пользователем")


if __name__ == "__main__":
    asyncio.run(main())
