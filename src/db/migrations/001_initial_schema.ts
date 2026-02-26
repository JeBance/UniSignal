import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Миграция 001: Создание начальной схемы базы данных
 * Таблицы: clients, channels, messages
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Таблица клиентов
  pgm.createTable('clients', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    api_key: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('clients', 'api_key');
  pgm.createIndex('clients', 'is_active');

  // Таблица каналов
  pgm.createTable('channels', {
    chat_id: {
      type: 'bigint',
      primaryKey: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('channels', 'is_active');

  // Таблица сообщений
  pgm.createTable('messages', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    unique_hash: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    channel_id: {
      type: 'bigint',
      notNull: true,
      references: 'channels(chat_id)',
      onDelete: 'CASCADE',
    },
    direction: {
      type: 'varchar(10)',
      default: null,
    },
    ticker: {
      type: 'varchar(50)',
      default: null,
    },
    entry_price: {
      type: 'numeric(20, 8)',
      default: null,
    },
    stop_loss: {
      type: 'numeric(20, 8)',
      default: null,
    },
    take_profit: {
      type: 'numeric(20, 8)',
      default: null,
    },
    content_text: {
      type: 'text',
      notNull: true,
    },
    original_timestamp: {
      type: 'timestamptz',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('messages', 'unique_hash');
  pgm.createIndex('messages', 'channel_id');
  pgm.createIndex('messages', 'direction');
  pgm.createIndex('messages', 'ticker');
  pgm.createIndex('messages', 'original_timestamp');

  // Триггер для обновления updated_at в channels
  pgm.createFunction(
    'update_updated_at_column',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
    },
    `
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger('channels', 'update_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTrigger('channels', 'update_updated_at');
  pgm.dropFunction('update_updated_at_column', []);
  pgm.dropTable('messages');
  pgm.dropTable('channels');
  pgm.dropTable('clients');
}
