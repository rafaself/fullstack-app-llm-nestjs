import 'reflect-metadata';
import { migrateDatabase } from '@cat-supplies-store/database';
import { PostgresWorkflowStore, fromPg } from '@nestjs/workflows/postgres';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';

const localDatabaseUrl = 'postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot';

function migrationDatabaseUrl(): string {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (process.env.NODE_ENV === 'production' && !migrationUrl) {
    throw new Error('MIGRATION_DATABASE_URL is required in production.');
  }
  return migrationUrl ?? process.env.DATABASE_URL ?? localDatabaseUrl;
}

async function grantWorkflowAccess(pool: Pool): Promise<void> {
  await pool.query(`
    DO $grants$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_business') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA nest_workflows TO chatbot_business';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nest_workflows TO chatbot_business';
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA nest_workflows TO chatbot_business';
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_migrator IN SCHEMA nest_workflows GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatbot_business';
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_migrator IN SCHEMA nest_workflows GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO chatbot_business';
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_worker') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA nest_workflows TO chatbot_worker';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nest_workflows TO chatbot_worker';
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA nest_workflows TO chatbot_worker';
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_migrator IN SCHEMA nest_workflows GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatbot_worker';
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_migrator IN SCHEMA nest_workflows GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO chatbot_worker';
      END IF;
    END
    $grants$;
  `);
}

async function migrate(): Promise<void> {
  const connectionString = migrationDatabaseUrl();
  const dataSource = new DataSource({
    type: 'postgres',
    url: connectionString,
    synchronize: false,
  });
  await dataSource.initialize();
  try {
    await migrateDatabase(dataSource);
  } finally {
    await dataSource.destroy();
  }

  const pool = new Pool({ connectionString });
  try {
    const store = new PostgresWorkflowStore({
      executor: fromPg(pool),
      migrate: true,
    });
    await store.migrate();
    await grantWorkflowAccess(pool);
  } finally {
    await pool.end();
  }
}

void migrate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
});
