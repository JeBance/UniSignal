import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import path from 'path';
import { logger } from '../utils/logger';
import { ClientRepository } from '../db/repositories/client-repository';
import { ChannelRepository } from '../db/repositories/channel-repository';
import { MessageRepository } from '../db/repositories/message-repository';
import { checkDatabaseConnection, getPool } from '../db/connection';
import { TelegrabHistoryService } from './telegrab-history';
import { MessageProcessor } from './message-processor';

export interface AdminApiConfig {
  adminMasterKey: string;
  port: number;
}

export interface AuthUser {
  role: 'admin' | 'client';
  clientId?: string;
}

/**
 * Admin HTTP API
 * Порт 8080, все эндпоинты требуют аутентификации
 * - Admin: ADMIN_MASTER_KEY (полный доступ)
 * - Client: API ключ клиента (только просмотр Dashboard и Сигналы)
 */
export class AdminApi {
  private app: express.Application;
  private config: AdminApiConfig;
  private clientRepo: ClientRepository;
  private channelRepo: ChannelRepository;
  private messageRepo: MessageRepository;

  constructor(config: AdminApiConfig) {
    this.app = express();
    this.config = config;
    this.clientRepo = new ClientRepository();
    this.channelRepo = new ChannelRepository();
    this.messageRepo = new MessageRepository();

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Создание сервисов для загрузки истории
   */
  private createHistoryServices() {
    const telegrabWsUrl = process.env.TELEGRAB_WS_URL || '';
    const telegrabApiKey = process.env.TELEGRAB_API_KEY || '';

    const historyService = new TelegrabHistoryService(telegrabWsUrl, telegrabApiKey);

    const messageProcessor = new MessageProcessor(
      this.channelRepo,
      this.messageRepo,
      { broadcastToClients: false } // Не транслировать клиентам
    );

    return { historyService, messageProcessor };
  }

  /**
   * Настройка middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());

    // Логгирование запросов
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.debug({ method: req.method, path: req.path }, 'HTTP запрос');
      next();
    });
  }

  /**
   * Настройка роутов
   */
  private setupRoutes(): void {
    // Public endpoints
    this.app.get('/health', this.healthCheck.bind(this));

    // Auth validation endpoint
    this.app.get('/api/auth/validate', this.validateAuth.bind(this));

    // Public read-only API для клиентов
    this.app.get('/api/stats', this.clientAuthMiddleware.bind(this), this.getStats.bind(this));
    this.app.get('/api/signals', this.clientAuthMiddleware.bind(this), this.getSignals.bind(this));

    // UI - статические файлы frontend
    this.app.use('/ui', express.static(path.join(__dirname, '../../frontend/dist')));
    this.app.get('/ui/*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    });

    // Admin endpoints (требуют ADMIN_MASTER_KEY)
    this.app.post('/admin/history/load', this.adminAuthMiddleware.bind(this), this.loadHistory.bind(this));
    this.app.delete('/admin/history/:chatId', this.adminAuthMiddleware.bind(this), this.clearHistory.bind(this));
    this.app.get('/admin/signals', this.adminAuthMiddleware.bind(this), this.getSignals.bind(this));
    this.app.post('/admin/clients', this.adminAuthMiddleware.bind(this), this.createClient.bind(this));
    this.app.get('/admin/clients', this.adminAuthMiddleware.bind(this), this.getClients.bind(this));
    this.app.delete('/admin/clients/:id', this.adminAuthMiddleware.bind(this), this.deleteClient.bind(this));
    this.app.post('/admin/channels', this.adminAuthMiddleware.bind(this), this.addChannel.bind(this));
    this.app.get('/admin/channels', this.adminAuthMiddleware.bind(this), this.getChannels.bind(this));
    this.app.delete('/admin/channels/:chatId', this.adminAuthMiddleware.bind(this), this.deleteChannel.bind(this));
    this.app.patch('/admin/channels/:chatId/toggle', this.adminAuthMiddleware.bind(this), this.toggleChannel.bind(this));
    this.app.get('/admin/stats', this.adminAuthMiddleware.bind(this), this.getStats.bind(this));

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not Found' });
    });
  }

  /**
   * Middleware для проверки админского ключа
   */
  private adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const adminKey = req.headers['x-admin-key'];
    const expectedKey = this.config.adminMasterKey;

    logger.debug({
      path: req.path,
      providedKey: adminKey,
      expectedKey,
      match: adminKey === expectedKey
    }, 'Проверка X-Admin-Key');

    if (!adminKey || adminKey !== expectedKey) {
      logger.warn(
        { path: req.path, hasKey: !!adminKey, keyLength: adminKey?.length },
        'Неверный или отсутствующий X-Admin-Key'
      );
      res.status(401).json({ error: 'Unauthorized: Invalid or missing X-Admin-Key' });
      return;
    }

    // Сохраняем информацию об пользователе для запроса
    (res.locals as any).authUser = { role: 'admin' } as AuthUser;
    next();
  }

  /**
   * Middleware для проверки API ключа клиента
   * Клиенты могут только читать stats и signals
   * Также принимает ADMIN_MASTER_KEY для полного доступа
   */
  private clientAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'];
    const adminKey = req.headers['x-admin-key'];

    logger.debug({
      path: req.path,
      hasApiKey: !!apiKey,
      hasAdminKey: !!adminKey
    }, 'Проверка ключа авторизации');

    // Сначала проверяем админский ключ
    if (adminKey && adminKey === this.config.adminMasterKey) {
      (res.locals as any).authUser = { role: 'admin' } as AuthUser;
      next();
      return;
    }

    // Если нет админского ключа, проверяем клиентский
    if (!apiKey) {
      logger.warn({ path: req.path }, 'Отсутствует ключ авторизации');
      res.status(401).json({ error: 'Unauthorized: Missing API Key' });
      return;
    }

    // Проверяем API ключ клиента
    this.clientRepo.getByApiKey(apiKey.toString())
      .then(client => {
        if (!client || !client.is_active) {
          logger.warn({ path: req.path, apiKey: apiKey.toString().substring(0, 8) }, 'Неверный API ключ');
          res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
          return;
        }

        // Сохраняем информацию об пользователе для запроса
        (res.locals as any).authUser = {
          role: 'client',
          clientId: client.id
        } as AuthUser;
        next();
      })
      .catch(err => {
        logger.error({ err }, 'Ошибка проверки API ключа');
        res.status(500).json({ error: 'Internal server error' });
      });
  }

  /**
   * Health check endpoint
   */
  private async healthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const dbOk = await checkDatabaseConnection();

      res.json({
        status: 'ok',
        service: 'UniSignal Relay',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbOk ? 'ok' : 'error',
        },
      });
    } catch (err) {
      logger.error({ err }, 'Ошибка health check');
      res.status(500).json({
        status: 'error',
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/auth/validate - Проверка ключа аутентификации
   * Принимает X-Admin-Key (для админа) или X-API-Key (для клиента)
   */
  private async validateAuth(req: Request, res: Response): Promise<void> {
    const adminKey = req.headers['x-admin-key'];
    const apiKey = req.headers['x-api-key'];

    // Проверяем админский ключ
    if (adminKey && adminKey === this.config.adminMasterKey) {
      res.json({
        valid: true,
        role: 'admin',
      });
      return;
    }

    // Проверяем клиентский ключ
    if (apiKey) {
      try {
        const client = await this.clientRepo.getByApiKey(apiKey.toString());
        if (client && client.is_active) {
          res.json({
            valid: true,
            role: 'client',
            clientId: client.id,
          });
          return;
        }
      } catch (err) {
        logger.error({ err }, 'Ошибка проверки API ключа');
      }
    }

    res.status(401).json({
      valid: false,
      error: 'Unauthorized',
    });
  }

  /**
   * POST /admin/clients - Создание клиента
   */
  private async createClient(_req: Request, res: Response): Promise<void> {
    try {
      const client = await this.clientRepo.create();
      
      if (!client) {
        res.status(500).json({ error: 'Failed to create client' });
        return;
      }

      logger.info({ clientId: client.id }, 'Клиент создан');
      
      res.status(201).json({
        id: client.id,
        api_key: client.api_key,
        is_active: client.is_active,
        created_at: client.created_at,
      });
    } catch (err) {
      logger.error({ err }, 'Ошибка создания клиента');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /admin/clients - Список клиентов
   */
  private async getClients(_req: Request, res: Response): Promise<void> {
    try {
      const clients = await this.clientRepo.getAll();
      
      res.json({
        count: clients.length,
        clients: clients.map(c => ({
          id: c.id,
          api_key: c.api_key,
          is_active: c.is_active,
          created_at: c.created_at,
        })),
      });
    } catch (err) {
      logger.error({ err }, 'Ошибка получения клиентов');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * DELETE /admin/clients/:id - Удаление клиента
   */
  private async deleteClient(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const success = await this.clientRepo.delete(id);
      
      if (!success) {
        res.status(500).json({ error: 'Failed to delete client' });
        return;
      }

      logger.info({ clientId: id }, 'Клиент удалён');
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, 'Ошибка удаления клиента');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /admin/channels - Добавление канала
   */
  private async addChannel(req: Request, res: Response): Promise<void> {
    try {
      const { chat_id, name, is_active } = req.body;

      if (!chat_id || !name) {
        res.status(400).json({ error: 'chat_id and name are required' });
        return;
      }

      const channel = await this.channelRepo.addChannel({
        chat_id: parseInt(chat_id, 10),
        name,
        is_active: is_active ?? true,
      });

      if (!channel) {
        res.status(500).json({ error: 'Failed to add channel' });
        return;
      }

      logger.info({ chatId: channel.chat_id, name: channel.name }, 'Канал добавлен');
      
      res.status(201).json(channel);
    } catch (err) {
      logger.error({ err }, 'Ошибка добавления канала');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /admin/channels - Список каналов
   */
  private async getChannels(req: Request, res: Response): Promise<void> {
    try {
      const all = req.query.all === 'true';
      const channels = all 
        ? await this.channelRepo.getAllChannels()
        : await this.channelRepo.getActiveChannels();
      
      res.json({
        count: channels.length,
        channels,
      });
    } catch (err) {
      logger.error({ err }, 'Ошибка получения каналов');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * DELETE /admin/channels/:chatId - Удаление канала
   */
  private async deleteChannel(req: Request, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const success = await this.channelRepo.deleteChannel(parseInt(chatId, 10));
      
      if (!success) {
        res.status(500).json({ error: 'Failed to delete channel' });
        return;
      }

      logger.info({ chatId }, 'Канал удалён');
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, 'Ошибка удаления канала');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * PATCH /admin/channels/:chatId/toggle - Переключение статуса канала
   */
  private async toggleChannel(req: Request, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const { is_active } = req.body;

      if (typeof is_active !== 'boolean') {
        res.status(400).json({ error: 'is_active (boolean) is required' });
        return;
      }

      const success = await this.channelRepo.updateChannelStatus(
        parseInt(chatId, 10),
        is_active
      );
      
      if (!success) {
        res.status(500).json({ error: 'Failed to update channel' });
        return;
      }

      logger.info({ chatId, isActive: is_active }, 'Статус канала обновлён');
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, 'Ошибка обновления статуса канала');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /admin/stats - Статистика
   */
  private async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.messageRepo.getStats();
      const channels = await this.channelRepo.getActiveChannels();
      const clients = await this.clientRepo.getAll();

      res.json({
        messages: stats || {
          total: 0,
          today: 0,
          with_ticker: 0,
          long_count: 0,
          short_count: 0,
        },
        channels: {
          active: channels.length,
        },
        clients: {
          total: clients.length,
          active: clients.filter(c => c.is_active).length,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Ошибка получения статистики');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /admin/history/load - Загрузка истории из Telegrab
   */
  private async loadHistory(req: Request, res: Response): Promise<void> {
    try {
      const { chat_id, limit } = req.body;

      if (!chat_id) {
        res.status(400).json({ error: 'chat_id is required' });
        return;
      }

      logger.info({
        chat_id,
        limit: limit || 'ALL (все сообщения)'
      }, 'Начало загрузки истории');

      const { historyService, messageProcessor } = this.createHistoryServices();

      // Загрузка истории (без лимита по умолчанию)
      // chat_id передаётся как есть (может быть строкой или числом)
      const messages = await historyService.loadChannelHistory(chat_id, limit);

      if (messages.length === 0) {
        res.json({
          success: true,
          loaded: 0,
          message: 'История пуста или недоступна',
        });
        return;
      }

      // Обработка и сохранение сообщений
      let savedCount = 0;
      let duplicateCount = 0;

      for (const msg of messages) {
        const processed = await messageProcessor.processMessage(msg);
        if (processed) {
          savedCount++;
        } else {
          duplicateCount++;
        }
      }

      logger.info({
        loaded: messages.length,
        saved: savedCount,
        duplicates: duplicateCount
      }, 'История загружена');

      res.json({
        success: true,
        loaded: messages.length,
        saved: savedCount,
        duplicates: duplicateCount,
      });
    } catch (err: unknown) {
      logger.error({ err }, 'Ошибка загрузки истории');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * DELETE /admin/history/:chatId - Очистка истории канала
   */
  private async clearHistory(req: Request, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;

      if (!chatId) {
        res.status(400).json({ error: 'chatId is required' });
        return;
      }

      logger.info({ chatId }, 'Очистка истории канала');

      const pool = getPool();
      const result = await pool.query(
        'DELETE FROM messages WHERE channel_id = $1',
        [chatId]
      );

      const deletedCount = result.rowCount || 0;
      logger.info({ chatId, deleted: deletedCount }, 'История канала очищена');

      res.json({
        success: true,
        deleted: deletedCount,
      });
    } catch (err: unknown) {
      logger.error({ err }, 'Ошибка очистки истории');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /admin/signals - Получение последних сигналов
   */
  private async getSignals(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;

      const pool = getPool();
      const result = await pool.query(`
        SELECT m.id, m.direction, m.ticker, m.entry_price, m.stop_loss, m.take_profit,
               m.content_text, m.original_timestamp, c.name as channel_name,
               m.parsed_signal
        FROM messages m
        LEFT JOIN channels c ON m.channel_id = c.chat_id
        ORDER BY m.created_at DESC
        LIMIT $1
      `, [limit]);

      const signals = result.rows.map((row: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: row.id,
        channel: row.channel_name || 'Unknown',
        direction: row.direction,
        ticker: row.ticker,
        entryPrice: row.entry_price ? parseFloat(row.entry_price) : null,
        stopLoss: row.stop_loss ? parseFloat(row.stop_loss) : null,
        takeProfit: row.take_profit ? parseFloat(row.take_profit) : null,
        text: row.content_text,
        timestamp: Math.floor(new Date(row.original_timestamp).getTime() / 1000),
        parsedSignal: row.parsed_signal || null,
      }));

      res.json({ signals });
    } catch (err: unknown) {
      logger.error({ err }, 'Ошибка получения сигналов');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Запуск сервера
   * Возвращает HTTP сервер для интеграции с WebSocket
   */
  public start(): Server {
    const server = this.app.listen(this.config.port, () => {
      logger.info(
        { port: this.config.port },
        `🌐 Admin HTTP API запущен на порту ${this.config.port}`
      );
    });
    return server;
  }

  /**
   * Получение Express приложения (для тестов)
   */
  public getApp(): express.Application {
    return this.app;
  }
}
