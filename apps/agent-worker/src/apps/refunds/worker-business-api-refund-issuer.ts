import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  internalRefundResponseSchema,
  type InternalRefundRequest,
} from '@cat-supplies-store/contracts';
import type { RefundIssuer } from '@cat-supplies-store/refunds';
import type { WorkerConfig } from '../../config/worker.config.js';

@Injectable()
export class WorkerBusinessApiRefundIssuer implements RefundIssuer {
  constructor(private readonly config: ConfigService) {}

  async refundOrder(
    customerId: string,
    orderId: string,
    idempotencyKey: string,
    refundRequestId: string,
  ) {
    const { businessApiUrl, auth } =
      this.config.getOrThrow<WorkerConfig>('worker');
    if (!auth.workerApiToken) {
      throw new Error('The Business API worker token is not configured.');
    }

    const input: InternalRefundRequest = {
      customerId,
      orderId,
      idempotencyKey,
      refundRequestId,
    };
    const response = await fetch(`${businessApiUrl}/internal/refunds`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.workerApiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(
        `The Business API refund request failed with HTTP ${response.status}.`,
      );
    }

    const body: unknown = await response.json();
    const result = internalRefundResponseSchema.safeParse(body);
    if (!result.success) {
      throw new Error('The Business API returned an invalid refund response.');
    }
    return result.data;
  }
}
