import { Injectable } from '@nestjs/common';
import {
  OrdersRepository,
  type CustomerOrder,
  type RefundRequestReservation,
} from './orders.repository';

export type OrderRecord = CustomerOrder;

@Injectable()
export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  async findForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<OrderRecord | null> {
    return this.orders.findForCustomer(customerId, orderId);
  }

  reserveRefundRequest(
    customerId: string,
    orderId: string,
    requestId: string,
  ): Promise<RefundRequestReservation> {
    return this.orders.reserveRefundRequest(customerId, orderId, requestId);
  }

  releaseRefundRequest(requestId: string): Promise<boolean> {
    return this.orders.releaseRefundRequest(requestId);
  }

  async changeAddress(
    customerId: string,
    orderId: string,
    address: string,
    confirmationId: string,
  ): Promise<OrderRecord | null> {
    return this.orders.changeAddress(
      customerId,
      orderId,
      address,
      confirmationId,
    );
  }

  proposeAddressChange(customerId: string, orderId: string, address: string) {
    return this.orders.proposeAddressChange(customerId, orderId, address);
  }

  approveAddressChange(
    customerId: string,
    confirmationId: string,
    orderId: string,
    address: string,
  ) {
    return this.orders.approveAddressChange(
      customerId,
      confirmationId,
      orderId,
      address,
    );
  }
}
