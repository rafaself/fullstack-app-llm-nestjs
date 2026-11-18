-- Run while connected to the application database as a DBA.
-- The application is expected to use a dedicated PostgreSQL database.
CREATE EXTENSION IF NOT EXISTS vector;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_business') THEN
    EXECUTE 'CREATE ROLE chatbot_business NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_agent') THEN
    EXECUTE 'CREATE ROLE chatbot_agent NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_worker') THEN
    EXECUTE 'CREATE ROLE chatbot_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_migrator') THEN
    EXECUTE 'CREATE ROLE chatbot_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT NOBYPASSRLS';
  END IF;
END
$roles$;

ALTER ROLE chatbot_business NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT NOBYPASSRLS;
ALTER ROLE chatbot_agent NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT NOBYPASSRLS;
ALTER ROLE chatbot_worker NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT NOBYPASSRLS;
ALTER ROLE chatbot_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT NOBYPASSRLS;

DO $database_grants$
DECLARE
  database_name text := current_database();
BEGIN
  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM PUBLIC', database_name);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO chatbot_business, chatbot_agent, chatbot_worker, chatbot_migrator', database_name);
  EXECUTE format('GRANT CREATE ON DATABASE %I TO chatbot_migrator', database_name);
END
$database_grants$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO chatbot_business, chatbot_agent, chatbot_worker;
GRANT USAGE, CREATE ON SCHEMA public TO chatbot_migrator;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, chatbot_business, chatbot_agent, chatbot_worker;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM PUBLIC, chatbot_business, chatbot_agent, chatbot_worker;

DO $ownership$
DECLARE
  item record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'nest_workflows') THEN
    EXECUTE 'ALTER SCHEMA nest_workflows OWNER TO chatbot_migrator';
  END IF;

  FOR item IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('public', 'nest_workflows')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO chatbot_migrator', item.schemaname, item.tablename);
  END LOOP;

  FOR item IN
    SELECT n.nspname AS schemaname, c.relname AS sequencename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND n.nspname IN ('public', 'nest_workflows')
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO chatbot_migrator', item.schemaname, item.sequencename);
  END LOOP;
END
$ownership$;

DO $table_grants$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customers', 'payments', 'orders', 'products', 'payment_refunds',
    'address_change_confirmations', 'throttler_rate_limits'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO chatbot_business', table_name);
    END IF;
  END LOOP;

  IF to_regclass('public.email_drafts') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.email_drafts TO chatbot_business';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.email_drafts TO chatbot_worker';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'conversations', 'conversation_turns', 'conversation_tool_executions',
    'conversation_approvals', 'throttler_rate_limits'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO chatbot_agent', table_name);
    END IF;
  END LOOP;
END
$table_grants$;

DO $workflow_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'nest_workflows') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA nest_workflows FROM chatbot_business, chatbot_agent, chatbot_worker';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA nest_workflows FROM chatbot_business, chatbot_agent, chatbot_worker';
    EXECUTE 'GRANT USAGE ON SCHEMA nest_workflows TO chatbot_business, chatbot_worker';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nest_workflows TO chatbot_business, chatbot_worker';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA nest_workflows TO chatbot_business, chatbot_worker';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_migrator IN SCHEMA nest_workflows GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatbot_business, chatbot_worker';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE chatbot_migrator IN SCHEMA nest_workflows GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO chatbot_business, chatbot_worker';
  END IF;
END
$workflow_grants$;
