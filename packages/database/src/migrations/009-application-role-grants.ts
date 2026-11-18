import type { QueryRunner } from 'typeorm';

export const migrationName = '009-application-role-grants';

export async function up(client: QueryRunner): Promise<void> {
  await client.query(`
    DO $grants$
    BEGIN
      IF 3 = (SELECT count(*) FROM pg_roles WHERE rolname IN (
        'chatbot_business', 'chatbot_agent', 'chatbot_worker'
      )) THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE
          public.customers, public.payments, public.orders, public.products,
          public.payment_refunds, public.email_drafts,
          public.address_change_confirmations, public.conversations,
          public.conversation_turns, public.conversation_tool_executions,
          public.conversation_approvals, public.throttler_rate_limits
          FROM PUBLIC, chatbot_business, chatbot_agent, chatbot_worker';
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_business') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
          public.customers, public.payments, public.orders, public.products,
          public.payment_refunds, public.address_change_confirmations,
          public.throttler_rate_limits TO chatbot_business';
        EXECUTE 'GRANT SELECT ON TABLE public.email_drafts TO chatbot_business';
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_agent') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
          public.conversations, public.conversation_turns,
          public.conversation_tool_executions, public.conversation_approvals,
          public.throttler_rate_limits TO chatbot_agent';
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_worker') THEN
        EXECUTE 'GRANT SELECT, INSERT ON TABLE public.email_drafts TO chatbot_worker';
      END IF;
    END
    $grants$;
  `);
}
