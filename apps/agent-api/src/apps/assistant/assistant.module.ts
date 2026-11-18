import { ConversationService } from './conversation.service';
import { ConversationRepository } from './conversation.repository';
import { BusinessApiModule } from '../../integrations/business-api/business-api.module';
import { OrdersTools } from './tools/orders.tools';
import { CatalogTools } from './tools/catalog.tools';
import { Module } from '@nestjs/common';
import {
  IdentityThrottlerGuard,
  IpThrottlerGuard,
} from '@cat-supplies-store/http';
import { CustomerAuthGuard } from '../../auth/customer-auth.guard';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { ChatStreamService } from './chat-stream.service';

@Module({
  imports: [BusinessApiModule],
  controllers: [AssistantController],
  providers: [
    ConversationService,
    ConversationRepository,
    ChatStreamService,
    AssistantService,
    CustomerAuthGuard,
    IdentityThrottlerGuard,
    IpThrottlerGuard,
    OrdersTools,
    CatalogTools,
  ],
})
export class AssistantModule {}
