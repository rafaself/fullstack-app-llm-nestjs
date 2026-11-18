import { Module } from '@nestjs/common';
import {
  IdentityThrottlerGuard,
  IpThrottlerGuard,
} from '@cat-supplies-store/http';
import { AiWorkflowsModule } from '@nestjs/ai/workflows';
import { OrdersModule } from '../orders/orders.module';
import {
  DemoCustomerGuard,
  SupportApprovalGuard,
} from '../../auth/demo-auth.guard';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [AiWorkflowsModule, OrdersModule],
  controllers: [RefundsController],
  providers: [
    RefundsService,
    DemoCustomerGuard,
    SupportApprovalGuard,
    IpThrottlerGuard,
    IdentityThrottlerGuard,
  ],
})
export class RefundsModule {}
