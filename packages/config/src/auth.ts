import { z } from 'zod';
import { toOptionalNonEmptyString } from '@cat-supplies-store/tools';
import { parseEnv } from './validation.js';

const authEnvSchema = z
  .object({
    DEMO_CUSTOMER_TOKEN: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
    SUPPORT_APPROVAL_TOKEN: z
      .string()
      .optional()
      .transform(toOptionalNonEmptyString),
    WORKER_API_TOKEN: z.string().optional().transform(toOptionalNonEmptyString),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === 'production' &&
      (!config.WORKER_API_TOKEN || config.WORKER_API_TOKEN.length < 32)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WORKER_API_TOKEN'],
        message: 'must contain at least 32 characters in production',
      });
    }
    if (
      config.DEMO_CUSTOMER_TOKEN &&
      config.DEMO_CUSTOMER_TOKEN === config.SUPPORT_APPROVAL_TOKEN
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SUPPORT_APPROVAL_TOKEN'],
        message: 'must differ from DEMO_CUSTOMER_TOKEN',
      });
    }
    if (
      config.WORKER_API_TOKEN &&
      (config.WORKER_API_TOKEN === config.DEMO_CUSTOMER_TOKEN ||
        config.WORKER_API_TOKEN === config.SUPPORT_APPROVAL_TOKEN)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WORKER_API_TOKEN'],
        message: 'must differ from customer and support tokens',
      });
    }
  })
  .transform(
    ({
      DEMO_CUSTOMER_TOKEN: demoCustomerToken,
      SUPPORT_APPROVAL_TOKEN: supportApprovalToken,
      WORKER_API_TOKEN: workerApiToken,
    }) => ({ demoCustomerToken, supportApprovalToken, workerApiToken }),
  );

export type AuthConfig = z.infer<typeof authEnvSchema>;

export function loadAuthConfig(env: Record<string, unknown>): AuthConfig {
  return parseEnv(authEnvSchema, env);
}
