import { z } from 'zod';
import { loadBusinessApiUrl } from '@cat-supplies-store/config';

export function loadAgentApiConfig(environment: Record<string, unknown>) {
  const agent = z
    .object({
      AGENT_API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    })
    .parse(environment);
  return {
    port: agent.AGENT_API_PORT,
    businessApiUrl: loadBusinessApiUrl(environment),
  };
}
