import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage, Server } from 'http';
import { logger } from '../utils/logger';
import { ClientRepository } from '../db/repositories/client-repository';
import { ProcessedMessage } from './message-processor';

export interface ClientWsConfig {
  httpServer: Server;
  path?: string;
  authTimeout?: number; // Время на аутентификацию (мс)
}

export interface AuthMessage {
  action: 'auth';
  api_key: string;
}

export interface WsMessage {
  action?: string;
  [key: string]: unknown;
}

interface ClientConnection {
  ws: WebSocket;
  clientId: string;
  authenticatedAt: Date;
}

/**
 * Downstream WebSocket-сервер для клиентов
 * Интегрируется с существующим HTTP сервером Express
 */
export class ClientWsServer {
  private wss: WebSocketServer;
  private config: ClientWsConfig;
  private clientRepo: ClientRepository;
  private connections: Map<WebSocket, ClientConnection> = new Map();
  private messageQueue: ProcessedMessage[] = [];
  private maxQueueSize: number = 100;

  constructor(config: ClientWsConfig, clientRepo: ClientRepository) {
    this.config = config;
    this.clientRepo = clientRepo;

    this.wss = new WebSocketServer({
      server: config.httpServer,
      path: config.path || '/ws',
    });

    this.setupServer();
  }

  /**
   * Настройка WebSocket сервера
   */
  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const ip = request.socket.remoteAddress || 'unknown';
      logger.info({ ip }, '🔌 Новое WebSocket подключение');
      
      this.handleConnection(ws, ip);
    });

    this.wss.on('error', (err: Error) => {
      logger.error({ err }, 'Ошибка WebSocket сервера');
    });

    logger.info(
      { path: this.config.path },
      `📡 Client WS сервер запущен`
    );
  }

  /**
   * Обработка нового подключения
   */
  private handleConnection(ws: WebSocket, ip: string): void {
    const authTimeout = this.config.authTimeout || 5000;
    let isAlive = true;

    // Таймаут на аутентификацию
    const authTimer = setTimeout(() => {
      if (!this.connections.has(ws)) {
        logger.warn({ ip }, 'Таймаут аутентификации, отключение');
        ws.close(4001, 'Authentication timeout');
      }
    }, authTimeout);

    // Обработка входящих сообщений
    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as WsMessage;
        
        if (message.action === 'auth') {
          const authMessage = message as unknown as AuthMessage;
          
          // Проверяем аутентификацию
          const client = await this.clientRepo.getByApiKey(authMessage.api_key);
          
          if (client) {
            // Успешная аутентификация
            clearTimeout(authTimer);
            
            this.connections.set(ws, {
              ws,
              clientId: client.id,
              authenticatedAt: new Date(),
            });

            ws.send(JSON.stringify({
              status: 'authenticated',
              message: 'Welcome to UniSignal Relay',
            }));

            logger.info(
              { clientId: client.id, ip },
              '✅ Клиент аутентифицирован'
            );

            // Отправляем накопленные сообщения (последние 10)
            const recentMessages = this.messageQueue.slice(-10);
            for (const msg of recentMessages) {
              this.sendToClient(ws, msg);
            }
          } else {
            // Неверный ключ
            logger.warn({ ip }, 'Неверный API ключ');
            ws.send(JSON.stringify({
              status: 'error',
              message: 'Invalid API Key',
            }));
            ws.close(4002, 'Invalid API Key');
          }
        } else {
          // Неизвестное действие
          if (!this.connections.has(ws)) {
            ws.send(JSON.stringify({
              status: 'error',
              message: 'Please authenticate first',
            }));
          }
        }
      } catch (err) {
        logger.error({ err, data: data.toString() }, 'Ошибка обработки сообщения');
        ws.send(JSON.stringify({
          status: 'error',
          message: 'Invalid JSON format',
        }));
      }
    });

    // Обработка закрытия
    ws.on('close', (code: number, reason: Buffer) => {
      this.connections.delete(ws);
      logger.debug(
        { code, reason: reason.toString() },
        'Клиент отключился'
      );
    });

    // Обработка ошибок
    ws.on('error', (err: Error) => {
      logger.error({ err }, 'Ошибка WebSocket соединения');
      isAlive = false;
    });

    // Ping/Pong для проверки alive
    ws.on('pong', () => {
      isAlive = true;
    });
  }

  /**
   * Отправка сообщения клиенту
   */
  private sendToClient(ws: WebSocket, message: ProcessedMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'signal',
          data: {
            id: message.id,
            channel: message.channel_name,
            direction: message.direction,
            ticker: message.ticker,
            entryPrice: message.entry_price,
            stopLoss: message.stop_loss,
            takeProfit: message.take_profit,
            text: message.content_text,
            timestamp: Math.floor(message.original_timestamp.getTime() / 1000),
          },
        }));
      } catch (err) {
        logger.error({ err }, 'Ошибка отправки сообщения клиенту');
      }
    }
  }

  /**
   * Трансляция сообщения всем подключенным клиентам
   */
  public broadcast(message: ProcessedMessage): void {
    // Добавляем в очередь
    this.messageQueue.push(message);
    
    // Ограничиваем размер очереди
    if (this.messageQueue.length > this.maxQueueSize) {
      this.messageQueue.shift();
    }

    let sentCount = 0;
    this.connections.forEach((connection, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, message);
        sentCount++;
      }
    });

    logger.debug(
      { sentCount, totalClients: this.connections.size },
      '📤 Сообщение отправлено клиентам'
    );
  }

  /**
   * Получение количества подключенных клиентов
   */
  public getClientCount(): number {
    return this.connections.size;
  }

  /**
   * Получение информации о подключениях
   */
  public getConnections(): Array<{ clientId: string; authenticatedAt: Date }> {
    return Array.from(this.connections.values()).map(c => ({
      clientId: c.clientId,
      authenticatedAt: c.authenticatedAt,
    }));
  }

  /**
   * Закрытие сервера
   */
  public close(): void {
    logger.info('Закрытие Client WebSocket сервера...');
    
    // Закрываем все подключения
    this.connections.forEach((connection, ws) => {
      ws.close(1001, 'Server shutdown');
    });
    
    this.connections.clear();
    this.wss.close();
    
    logger.info('Client WebSocket сервер закрыт');
  }

  /**
   * Получение WebSocket сервера (для тестов)
   */
  public getServer(): WebSocketServer {
    return this.wss;
  }
}
