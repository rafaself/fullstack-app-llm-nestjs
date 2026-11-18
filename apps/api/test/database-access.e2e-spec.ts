import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresWorkflowStore, fromPg } from '@nestjs/workflows/postgres';
import {
  createMigratedDataSource,
  databaseOptions,
} from '@cat-supplies-store/database';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://chatbot:chatbot@127.0.0.1:15432/chatbot_test';

describe('PostgreSQL application roles', () => {
  let database: DataSource;
  let workflowPool: Pool;

  beforeAll(async () => {
    database = await createMigratedDataSource(
      databaseOptions({
        connectionString: databaseUrl,
        migrationsOnStart: true,
      }),
    );
    workflowPool = new Pool({ connectionString: databaseUrl });
    await new PostgresWorkflowStore({
      executor: fromPg(workflowPool),
      migrate: true,
    }).migrate();
    await database.query(
      readFileSync(resolve(process.cwd(), 'infra/postgres-roles.sql'), 'utf8'),
    );
  });

  afterAll(async () => {
    await workflowPool?.end();
    await database?.destroy();
  });

  it('limits Agent API access to conversation and shared throttler tables', async () => {
    const conversationId = randomUUID();
    try {
      await withRole('chatbot_agent', async (runner) => {
        await runner.query(
          'INSERT INTO conversations (id, customer_id) VALUES ($1, $2)',
          [conversationId, 'cus_123'],
        );
        await runner.query('SELECT 1 FROM conversation_turns LIMIT 1');
        await runner.query('SELECT 1 FROM throttler_rate_limits LIMIT 1');
        await expectPermissionDenied(runner, 'SELECT 1 FROM orders LIMIT 1');
        await expectPermissionDenied(
          runner,
          'SELECT 1 FROM email_drafts LIMIT 1',
        );
        await expectPermissionDenied(
          runner,
          'UPDATE payments SET status = status WHERE id = $1',
          ['pay_123'],
        );
        await expectPermissionDenied(
          runner,
          'CREATE TABLE public.agent_role_probe (id integer)',
        );
      });
    } finally {
      await database.query('DELETE FROM conversations WHERE id = $1', [
        conversationId,
      ]);
    }
  });

  it('limits Business API access to business data and shared workflows', async () => {
    await withRole('chatbot_business', async (runner) => {
      await runner.query('SELECT 1 FROM orders LIMIT 1');
      await runner.query('SELECT 1 FROM email_drafts LIMIT 1');
      await runner.query('SELECT 1 FROM nest_workflows.instances LIMIT 1');
      await runner.query('SELECT 1 FROM throttler_rate_limits LIMIT 1');
      await runner.query(
        "UPDATE orders SET refundable = refundable WHERE id = 'ord_123'",
      );
      await expectPermissionDenied(
        runner,
        'SELECT 1 FROM conversations LIMIT 1',
      );
      await expectPermissionDenied(
        runner,
        'CREATE TABLE public.business_role_probe (id integer)',
      );
      await expectPermissionDenied(
        runner,
        'INSERT INTO email_drafts (job_id, requester_id, message_id, subject, sender, classification, draft) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)',
        [
          'business-role-test',
          'test',
          'message',
          'subject',
          'sender',
          '{}',
          'draft',
        ],
      );
    });
  });

  it('limits Agent Worker access to job results and workflow state', async () => {
    const jobId = `worker-role-${Date.now()}`;
    try {
      await withRole('chatbot_worker', async (runner) => {
        await runner.query('SELECT 1 FROM email_drafts LIMIT 1');
        await runner.query('SELECT 1 FROM nest_workflows.instances LIMIT 1');
        await runner.query(
          `INSERT INTO email_drafts (job_id, requester_id, message_id, subject, sender, classification, draft)
           VALUES ($1, 'role-test', $1, 'subject', 'sender', '{}'::jsonb, 'draft')`,
          [jobId],
        );
        await expectPermissionDenied(runner, 'SELECT 1 FROM orders LIMIT 1');
        await expectPermissionDenied(runner, 'SELECT 1 FROM payments LIMIT 1');
        await expectPermissionDenied(
          runner,
          'UPDATE email_drafts SET draft = draft WHERE job_id = $1',
          [jobId],
        );
        await expectPermissionDenied(
          runner,
          'SELECT 1 FROM conversations LIMIT 1',
        );
        await expectPermissionDenied(
          runner,
          'CREATE TABLE nest_workflows.worker_role_probe (id integer)',
        );
      });
    } finally {
      await database.query('DELETE FROM email_drafts WHERE job_id = $1', [
        jobId,
      ]);
    }
  });

  async function withRole(
    role: 'chatbot_agent' | 'chatbot_business' | 'chatbot_worker',
    run: (runner: ReturnType<DataSource['createQueryRunner']>) => Promise<void>,
  ) {
    const runner = database.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET ROLE ${role}`);
      await run(runner);
    } finally {
      await runner.query('RESET ROLE');
      await runner.release();
    }
  }

  async function expectPermissionDenied(
    runner: ReturnType<DataSource['createQueryRunner']>,
    sql: string,
    parameters?: unknown[],
  ) {
    await expect(runner.query(sql, parameters)).rejects.toMatchObject({
      driverError: { code: '42501' },
    });
  }
});
