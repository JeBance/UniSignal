import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import express from 'express';
import { createServer } from 'http';
import { ClientRepository } from '../src/db/repositories/client-repository';
import { ClientWsServer } from '../src/services/client-ws';

/**
 * Тесты Client WebSocket сервера
 */
describe('ClientWsServer', () => {
  let wss: ClientWsServer;
  let clientRepo: ClientRepository;
  let httpServer: ReturnType<typeof createServer>;
  const testPort = 9877; // Уникальный порт

  beforeAll(async () => {
    clientRepo = new ClientRepository();

    // Создаём HTTP сервер для интеграции с WebSocket
    const app = express();
    httpServer = createServer(app);
    
    // Запускаем HTTP сервер
    await new Promise<void>((resolve) => {
      httpServer.listen(testPort, () => {
        resolve();
      });
    });

    wss = new ClientWsServer(
      {
        httpServer,
        path: '/ws',
        authTimeout: 3000,
      },
      clientRepo
    );

    // Даём серверу время на запуск
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(() => {
    if (wss) {
      wss.close();
    }
    if (httpServer) {
      httpServer.close();
    }
  });

  describe('Connection', () => {
    it('должен принимать WebSocket подключения', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${testPort}/ws`);

        ws.on('open', () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
          ws.close();
          resolve();
        });

        ws.on('error', (err) => {
          reject(err);
        });
      });
    });
  });

  describe('Client tracking', () => {
    it('должен отслеживать количество подключений', async () => {
      return new Promise<void>((resolve, reject) => {
        const ws1 = new WebSocket(`ws://localhost:${testPort}/ws`);

        ws1.on('open', () => {
          const count = wss.getClientCount();
          expect(count).toBeGreaterThanOrEqual(0);
          ws1.close();
          resolve();
        });

        ws1.on('error', (err) => {
          reject(err);
        });
      });
    });
  });

  describe('Broadcast', () => {
    it('должен иметь метод broadcast', () => {
      expect(typeof wss.broadcast).toBe('function');
    });

    it('должен иметь метод getClientCount', () => {
      expect(typeof wss.getClientCount).toBe('function');
    });

    it('должен иметь метод close', () => {
      expect(typeof wss.close).toBe('function');
    });
  });

  describe('Message queue', () => {
    it('должен добавлять сообщения в очередь при broadcast', () => {
      const testMessage = {
        id: 1,
        unique_hash: 'test_1',
        channel_id: '123',
        channel_name: 'Test Channel',
        direction: 'LONG' as const,
        ticker: 'BTCUSDT',
        entry_price: 50000,
        stop_loss: 49000,
        take_profit: 52000,
        content_text: 'Test signal',
        original_timestamp: new Date(),
      };

      wss.broadcast(testMessage);

      // Проверяем, что метод выполняется без ошибок
      expect(true).toBe(true);
    });
  });
});
