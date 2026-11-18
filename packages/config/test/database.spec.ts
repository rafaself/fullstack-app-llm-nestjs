import { describe, expect, it } from 'vitest';
import { loadDatabaseConfig } from '../src/database.js';

describe('service database configuration', () => {
  it('keeps the shared local database URL and startup migrations by default', () => {
    expect(loadDatabaseConfig({})).toMatchObject({
      connectionString: 'postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot',
      migrationsOnStart: true,
    });
    expect(
      loadDatabaseConfig({ DATABASE_URL: 'postgresql://local/db' }, 'agent')
        .connectionString,
    ).toBe('postgresql://local/db');
  });

  it.each([
    ['business', 'BUSINESS_DATABASE_URL'],
    ['agent', 'AGENT_DATABASE_URL'],
    ['worker', 'WORKER_DATABASE_URL'],
  ] as const)(
    'requires the dedicated %s URL in production and disables startup migrations',
    (application, variable) => {
      expect(() =>
        loadDatabaseConfig(
          {
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://shared/db',
          },
          application,
        ),
      ).toThrow(variable);

      const config = loadDatabaseConfig(
        {
          NODE_ENV: 'production',
          [variable]: `postgresql://${application}:secret@db:5432/store`,
        },
        application,
      );
      expect(config).toMatchObject({
        connectionString: `postgresql://${application}:secret@db:5432/store`,
        migrationsOnStart: false,
      });
    },
  );
});
