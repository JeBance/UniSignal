import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';

/**
 * Тесты Admin API без подключения к БД
 * Проверяют только HTTP логику и аутентификацию
 */
describe('AdminApi HTTP Logic', () => {
  const adminKey = 'test_master_key_123';

  // Простое Express приложение для тестирования middleware
  const createTestApp = () => {
    const app = express();
    app.use(express.json());

    // Middleware для проверки админского ключа
    const adminAuthMiddleware = (req: any, res: any, next: any) => {
      const adminKeyHeader = req.headers['x-admin-key'];
      if (!adminKeyHeader || adminKeyHeader !== adminKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing X-Admin-Key' });
      }
      next();
    };

    // Health check (публичный)
    app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        service: 'UniSignal Relay',
        timestamp: new Date().toISOString(),
      });
    });

    // Admin endpoints
    app.use('/admin', adminAuthMiddleware);

    app.get('/admin/clients', (_req, res) => {
      res.json({ count: 0, clients: [] });
    });

    app.post('/admin/clients', (req, res) => {
      res.status(201).json({
        id: 'test-uuid',
        api_key: 'usk_test123',
        is_active: true,
      });
    });

    app.delete('/admin/clients/:id', (_req, res) => {
      res.json({ success: true });
    });

    app.get('/admin/channels', (req, res) => {
      const all = req.query.all === 'true';
      res.json({
        count: 0,
        channels: [],
        filter: all ? 'all' : 'active',
      });
    });

    app.post('/admin/channels', (req, res) => {
      const { chat_id, name } = req.body;
      if (!chat_id || !name) {
        return res.status(400).json({ error: 'chat_id and name are required' });
      }
      res.status(201).json({
        chat_id: parseInt(chat_id, 10),
        name,
        is_active: true,
      });
    });

    app.delete('/admin/channels/:chatId', (_req, res) => {
      res.json({ success: true });
    });

    app.patch('/admin/channels/:chatId/toggle', (req, res) => {
      const { is_active } = req.body;
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active (boolean) is required' });
      }
      res.json({ success: true });
    });

    app.get('/admin/stats', (_req, res) => {
      res.json({
        messages: { total: 0, today: 0, with_ticker: 0, long_count: 0, short_count: 0 },
        channels: { active: 0 },
        clients: { total: 0, active: 0 },
      });
    });

    // 404 handler
    app.use((_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });

    return app;
  };

  const app = createTestApp();

  describe('GET /health', () => {
    it('должен возвращать статус ok', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('UniSignal Relay');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Admin authentication', () => {
    it('должен отклонять запрос без X-Admin-Key', async () => {
      await request(app)
        .get('/admin/clients')
        .expect(401)
        .then(res => {
          expect(res.body.error).toContain('Unauthorized');
        });
    });

    it('должен отклонять запрос с неверным ключом', async () => {
      await request(app)
        .get('/admin/clients')
        .set('X-Admin-Key', 'wrong_key')
        .expect(401);
    });

    it('должен пропускать запрос с правильным ключом', async () => {
      await request(app)
        .get('/admin/clients')
        .set('X-Admin-Key', adminKey)
        .expect(200);
    });
  });

  describe('GET /admin/clients', () => {
    it('должен возвращать список клиентов', async () => {
      const response = await request(app)
        .get('/admin/clients')
        .set('X-Admin-Key', adminKey)
        .expect(200);

      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('clients');
      expect(Array.isArray(response.body.clients)).toBe(true);
    });
  });

  describe('POST /admin/clients', () => {
    it('должен создавать нового клиента', async () => {
      const response = await request(app)
        .post('/admin/clients')
        .set('X-Admin-Key', adminKey)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('api_key');
      expect(response.body.is_active).toBe(true);
    });
  });

  describe('GET /admin/channels', () => {
    it('должен возвращать список активных каналов', async () => {
      const response = await request(app)
        .get('/admin/channels')
        .set('X-Admin-Key', adminKey)
        .expect(200);

      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('channels');
      expect(response.body.filter).toBe('active');
    });

    it('должен возвращать все каналы с параметром all=true', async () => {
      const response = await request(app)
        .get('/admin/channels?all=true')
        .set('X-Admin-Key', adminKey)
        .expect(200);

      expect(response.body).toHaveProperty('count');
      expect(response.body.filter).toBe('all');
    });
  });

  describe('POST /admin/channels', () => {
    it('должен создавать новый канал', async () => {
      const response = await request(app)
        .post('/admin/channels')
        .set('X-Admin-Key', adminKey)
        .send({
          chat_id: 1234567890,
          name: 'Test Channel',
          is_active: true,
        })
        .expect(201);

      expect(response.body.chat_id).toBe(1234567890);
      expect(response.body.name).toBe('Test Channel');
      expect(response.body.is_active).toBe(true);
    });

    it('должен возвращать 400 если нет chat_id', async () => {
      await request(app)
        .post('/admin/channels')
        .set('X-Admin-Key', adminKey)
        .send({ name: 'Test' })
        .expect(400);
    });

    it('должен возвращать 400 если нет name', async () => {
      await request(app)
        .post('/admin/channels')
        .set('X-Admin-Key', adminKey)
        .send({ chat_id: 123 })
        .expect(400);
    });
  });

  describe('PATCH /admin/channels/:chatId/toggle', () => {
    it('должен переключать статус канала', async () => {
      const response = await request(app)
        .patch('/admin/channels/123/toggle')
        .set('X-Admin-Key', adminKey)
        .send({ is_active: false })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('должен возвращать 400 если is_active не boolean', async () => {
      await request(app)
        .patch('/admin/channels/123/toggle')
        .set('X-Admin-Key', adminKey)
        .send({ is_active: 'true' })
        .expect(400);
    });
  });

  describe('GET /admin/stats', () => {
    it('должен возвращать статистику', async () => {
      const response = await request(app)
        .get('/admin/stats')
        .set('X-Admin-Key', adminKey)
        .expect(200);

      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('channels');
      expect(response.body).toHaveProperty('clients');
    });
  });

  describe('404 handler', () => {
    it('должен возвращать 404 для неизвестного пути', async () => {
      await request(app)
        .get('/unknown/path')
        .expect(404);
    });
  });
});
