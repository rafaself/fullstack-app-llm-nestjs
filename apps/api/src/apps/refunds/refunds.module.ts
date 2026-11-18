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
import { InternalRefundsController } from './internal-refunds.controller';
import { PaymentsModule } from '@cat-supplies-store/refunds';
import { WorkerAuthGuard } from '../../auth/worker-auth.guard';

@Module({
  imports: [AiWorkflowsModule, OrdersModule, PaymentsModule],
  controllers: [RefundsController, InternalRefundsController],
  providers: [
    RefundsService,
    DemoCustomerGuard,
    SupportApprovalGuard,
    IpThrottlerGuard,
    IdentityThrottlerGuard,
    WorkerAuthGuard,
  ],
})
export class RefundsModule {}
