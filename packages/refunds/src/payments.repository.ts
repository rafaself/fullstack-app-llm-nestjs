import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaymentEntity,
  OrderEntity,
  PaymentRefundEntity,
} from '@cat-supplies-store/database';

export interface PersistedRefund {
  paymentId: string;
  amountCents: number;
  idempotencyKey: string;
}

export type RefundPersistenceResult =
  | { status: 'success'; refund: PersistedRefund }
  | { status: 'not_found' | 'idempotency_conflict' | 'ineligible' };

@Injectable()
export class PaymentsRepository {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly repository: Repository<PaymentEntity>,
  ) {}

  refundOrder(
    customerId: string,
    orderId: string,
    idempotencyKey: string,
    refundRequestId?: string,
  ): Promise<RefundPersistenceResult> {
    return this.repository.manager.transaction(async (manager) => {
      const orders = manager.getRepository(OrderEntity);
      const payments = manager.getRepository(PaymentEntity);
      const refunds = manager.getRepository(PaymentRefundEntity);
      const order = await orders.findOne({
        where: { id: orderId, customer_id: customerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) return { status: 'not_found' };
      const payment = await payments.findOne({
        where: { id: order.payment_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) return { status: 'not_found' };

      const priorRefund = await refunds.findOneBy({
        idempotency_key: idempotencyKey,
      });
      if (priorRefund) {
        if (
          priorRefund.payment_id !== order.payment_id ||
          priorRefund.amount_cents !== order.total_cents
        ) {
          return { status: 'idempotency_conflict' };
        }
        await orders.update(order.id, {
          refundable: false,
          refund_request_id: null,
        });
        return {
          status: 'success',
          refund: {
            paymentId: priorRefund.payment_id,
            amountCents: priorRefund.amount_cents,
            idempotencyKey,
          },
        };
      }

      if (
        (await refunds.existsBy({ payment_id: payment.id })) ||
        !order.refundable ||
        order.status !== 'delivered' ||
        (order.refund_request_id !== null &&
          order.refund_request_id !== refundRequestId) ||
        payment.refunded_cents + order.total_cents > payment.amount_cents
      ) {
        return { status: 'ineligible' };
      }

      await refunds.insert({
        idempotency_key: idempotencyKey,
        payment_id: payment.id,
        amount_cents: order.total_cents,
      });
      const refundedCents = payment.refunded_cents + order.total_cents;
      const paymentUpdate = await payments.update(payment.id, {
        refunded_cents: refundedCents,
        status:
          refundedCents >= payment.amount_cents
            ? 'refunded'
            : 'partially_refunded',
      });
      if (paymentUpdate.affected !== 1) {
        throw new Error('Payment state changed during refund.');
      }

      const orderUpdate = await orders.update(
        { id: order.id, refundable: true },
        { refundable: false, refund_request_id: null },
      );
      if (orderUpdate.affected !== 1) {
        throw new Error('Order state changed during refund.');
      }

      return {
        status: 'success',
        refund: {
          paymentId: order.payment_id,
          amountCents: order.total_cents,
          idempotencyKey,
        },
      };
    });
  }
}
