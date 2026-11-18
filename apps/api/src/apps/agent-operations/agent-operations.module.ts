import { Module } from '@nestjs/common';
import {
  IdentityThrottlerGuard,
  IpThrottlerGuard,
} from '@cat-supplies-store/http';
import { DemoCustomerGuard } from '../../auth/demo-auth.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { AgentOperationsController } from './agent-operations.controller';

@Module({
  imports: [CatalogModule, OrdersModule],
  controllers: [AgentOperationsController],
  providers: [DemoCustomerGuard, IpThrottlerGuard, IdentityThrottlerGuard],
})
export class AgentOperationsModule {}
