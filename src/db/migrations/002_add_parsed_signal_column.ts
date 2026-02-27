import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions = {};

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Добавляем колонку parsed_signal для хранения JSON от нового парсера
  pgm.addColumn('messages', {
    parsed_signal: {
      type: 'jsonb',
      notNull: false,
      comment: 'Распарсенный сигнал в формате JSON (новый парсер)',
    },
  });

  // Создаём индекс для быстрого поиска по типу сигнала
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS messages_parsed_signal_type_idx 
    ON messages ((parsed_signal->'signal'->>'type'))
  `);

  // Создаём индекс для поиска по тикеру из parsed_signal
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS messages_parsed_signal_ticker_idx 
    ON messages ((parsed_signal->'signal'->'instrument'->>'ticker'))
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('messages', 'messages_parsed_signal_ticker_idx', { ifExists: true });
  pgm.dropIndex('messages', 'messages_parsed_signal_type_idx', { ifExists: true });
  pgm.dropColumn('messages', 'parsed_signal');
}
