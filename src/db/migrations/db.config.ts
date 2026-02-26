import type { RunnerOption } from 'node-pg-migrate';

const config: RunnerOption = {
  databaseUrl: process.env.DATABASE_URL || 'postgresql://unisignal:unisignal_password@localhost:5432/unisignal',
  migrationsTable: 'pgmigrations',
  dir: 'src/db/migrations',
  direction: 'up',
};

export default config;
