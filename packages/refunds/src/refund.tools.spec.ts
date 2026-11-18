import type { AgentFunctionContext } from '@nestjs/ai';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RefundTools } from './refund.tools.js';

function context(
  user:
    | { id?: unknown; refundOrderId?: unknown; refundRequestId?: unknown }
    | undefined,
  idempotencyKey: string | undefined = 'durable-refund-key',
): AgentFunctionContext<
  unknown,
  { id?: unknown; refundOrderId?: unknown; refundRequestId?: unknown }
> {
  return {
    name: 'issue-refund',
    user,
    idempotencyKey,
    signal: new AbortController().signal,
    toolCallId: 'call-1',
    messages: [],
    reportProgress: async () => undefined,
  };
}

function setup() {
  const refundOrder = vi.fn().mockResolvedValue({
    paymentId: 'pay_123',
    amountCents: 4599,
    idempotencyKey: 'durable-refund-key',
    status: 'simulated',
  });
  return { refundOrder, tools: new RefundTools({ refundOrder }) };
}

const input = { orderId: 'ord_123', reason: 'The item arrived damaged.' };

describe('RefundTools authorization', () => {
  it('rejects another order before invoking payment logic, including for the same customer', async () => {
    const { tools, refundOrder } = setup();
    await expect(
      tools.issueRefund(
        { ...input, orderId: 'ord_124' },
        context({
          id: 'cus_123',
          refundOrderId: 'ord_123',
          refundRequestId: 'refund-123',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    {},
    { id: 'cus_123' },
    { id: 'cus_123', refundOrderId: undefined },
    { id: 'cus_123', refundOrderId: '' },
    { id: 'cus_123', refundOrderId: 123 },
    { id: 'cus_123', refundOrderId: 'ord_123' },
    { id: 'cus_123', refundOrderId: 'ord_123', refundRequestId: '' },
    { refundOrderId: 'ord_123' },
  ])(
    'fails closed without trusted workflow identity and order %#',
    async (user) => {
      const { tools, refundOrder } = setup();
      await expect(
        tools.issueRefund(input, context(user)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refundOrder).not.toHaveBeenCalled();
    },
  );

  it('requires the durable idempotency key even for a matching order', async () => {
    const { tools, refundOrder } = setup();
    const caller = context(
      {
        id: 'cus_123',
        refundOrderId: 'ord_123',
        refundRequestId: 'refund-123',
      },
      '',
    );
    await expect(tools.issueRefund(input, caller)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it('passes the bound customer, order, and unchanged durable key to payments', async () => {
    const { tools, refundOrder } = setup();
    await expect(
      tools.issueRefund(
        input,
        context({
          id: 'cus_123',
          refundOrderId: 'ord_123',
          refundRequestId: 'refund-123',
        }),
      ),
    ).resolves.toEqual({
      paymentId: 'pay_123',
      amountCents: 4599,
      idempotencyKey: 'durable-refund-key',
      status: 'simulated',
    });
    expect(refundOrder).toHaveBeenCalledExactlyOnceWith(
      'cus_123',
      'ord_123',
      'durable-refund-key',
      'refund-123',
    );
  });
});
