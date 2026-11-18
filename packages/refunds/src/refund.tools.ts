import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

export interface RefundIssuer {
  refundOrder(
    customerId: string,
    orderId: string,
    idempotencyKey: string,
    refundRequestId: string,
  ): Promise<{
    paymentId: string;
    amountCents: number;
    idempotencyKey: string;
    status: 'simulated';
  }>;
}

export const REFUND_ISSUER = Symbol('REFUND_ISSUER');

@Injectable()
export class RefundTools {
  constructor(@Inject(REFUND_ISSUER) private readonly issuer: RefundIssuer) {}

  @AgentFunction({
    name: 'issue-refund',
    description:
      'Issue the simulated full refund for a delivered order after a support reviewer approves it.',
    inputSchema: z.object({
      orderId: z.string().min(1).max(80),
      reason: z.string().trim().min(3).max(500),
    }),
  })
  async issueRefund(
    { orderId }: { orderId: string; reason: string },
    context: AgentFunctionContext<
      unknown,
      { id?: unknown; refundOrderId?: unknown; refundRequestId?: unknown }
    >,
  ) {
    const customerId = context.user?.id;
    const refundOrderId = context.user?.refundOrderId;
    const refundRequestId = context.user?.refundRequestId;
    if (
      typeof customerId !== 'string' ||
      typeof refundOrderId !== 'string' ||
      !refundOrderId ||
      typeof refundRequestId !== 'string' ||
      !refundRequestId ||
      !context.idempotencyKey
    ) {
      throw new UnauthorizedException(
        'Refunds require an authenticated durable workflow.',
      );
    }
    if (orderId !== refundOrderId) {
      throw new ForbiddenException(
        'Refund order must match the original request.',
      );
    }
    return this.issuer.refundOrder(
      customerId,
      refundOrderId,
      context.idempotencyKey,
      refundRequestId,
    );
  }
}
