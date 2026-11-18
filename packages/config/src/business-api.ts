import { z } from 'zod';

export function loadBusinessApiUrl(environment: Record<string, unknown>) {
  const { BUSINESS_API_URL: url } = z
    .object({ BUSINESS_API_URL: z.url().default('http://127.0.0.1:3000') })
    .parse(environment);
  const businessUrl = new URL(url);
  if (
    !['http:', 'https:'].includes(businessUrl.protocol) ||
    businessUrl.username ||
    businessUrl.password ||
    businessUrl.search ||
    businessUrl.hash
  ) {
    throw new Error(
      'BUSINESS_API_URL must be an HTTP(S) URL without credentials, query, or fragment.',
    );
  }
  return url.replace(/\/$/, '');
}
