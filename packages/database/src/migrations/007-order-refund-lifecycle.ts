import type { QueryRunner } from 'typeorm';

export const migrationName = '007-order-refund-lifecycle';

export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    ALTER TABLE orders
      ADD COLUMN refund_request_id text;

    CREATE UNIQUE INDEX order_refund_request_id_key
      ON orders (refund_request_id)
      WHERE refund_request_id IS NOT NULL;
  `);
}
