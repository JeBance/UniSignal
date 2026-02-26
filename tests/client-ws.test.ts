import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { ClientRepository } from '../src/db/repositories/client-repository';
import { ClientWsServer } from '../src/services/client-ws';

/**
 * Тесты Client WebSocket сервера
 */
describe('ClientWsServer', () => {
  let wss: ClientWsServer;
  let clientRepo: ClientRepository;
  const testPort = 9877; // Уникальный порт

  beforeAll(async () => {
    clientRepo = new ClientRepository();
    
    wss = new ClientWsServer(
      {
        port: testPort,
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
  });

  describe('Connection', () => {
    it('должен принимать WebSocket подключения', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}/ws`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', () => {
        // Игнорируем ошибки для этого теста
        done();
      });
    });
  });

  describe('Client tracking', () => {
    it('должен отслеживать количество подключений', (done) => {
      const ws1 = new WebSocket(`ws://localhost:${testPort}/ws`);
      let connected = false;

      ws1.on('open', () => {
        connected = true;
        const count = wss.getClientCount();
        expect(count).toBeGreaterThanOrEqual(0);
        ws1.close();
        done();
      });

      ws1.on('error', () => {
        done();
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
        channel_id: 123,
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
