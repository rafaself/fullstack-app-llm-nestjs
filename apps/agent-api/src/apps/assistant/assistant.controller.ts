import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IdentityThrottlerGuard,
  IpThrottlerGuard,
} from '@cat-supplies-store/http';
import {
  chatRequestSchema,
  conversationIdSchema,
  conversationApprovalSchema,
  createConversationSchema,
  addressConfirmationIdSchema,
  type ChatRequest,
} from '@cat-supplies-store/contracts';
import { CustomerAuthGuard } from '../../auth/customer-auth.guard';
import type { CustomerRequest } from '../../integrations/business-api/business-api.client';
import { ConversationService } from './conversation.service';

@Controller('assistant/conversations')
@UseGuards(IpThrottlerGuard, CustomerAuthGuard, IdentityThrottlerGuard)
@Throttle({
  ip: { limit: 120, ttl: 60_000 },
  identity: { limit: 60, ttl: 60_000 },
})
export class AssistantController {
  constructor(private readonly conversations: ConversationService) {}

  @Post()
  @Throttle({
    ip: { limit: 60, ttl: 60_000 },
    identity: { limit: 20, ttl: 60_000 },
  })
  create(
    @Body({ schema: createConversationSchema }) _body: Record<string, never>,
    @Req() request: CustomerRequest,
  ) {
    return this.conversations.create(request);
  }

  @Get()
  list(@Req() request: CustomerRequest) {
    return this.conversations.list(request);
  }

  @Get(':conversationId')
  @Throttle({
    ip: { limit: 120, ttl: 60_000 },
    identity: { limit: 120, ttl: 60_000 },
  })
  history(
    @Param('conversationId', { schema: conversationIdSchema }) id: string,
    @Req() request: CustomerRequest,
  ) {
    return this.conversations.history(id, request);
  }

  @Post(':conversationId/messages')
  @Throttle({
    ip: { limit: 30, ttl: 60_000 },
    identity: { limit: 10, ttl: 60_000 },
  })
  send(
    @Param('conversationId', { schema: conversationIdSchema }) id: string,
    @Body({ schema: chatRequestSchema }) body: ChatRequest,
    @Req() request: CustomerRequest,
  ) {
    return this.conversations.send(id, body, request);
  }

  @Post(':conversationId/approvals/:confirmationId')
  @Throttle({
    ip: { limit: 30, ttl: 60_000 },
    identity: { limit: 10, ttl: 60_000 },
  })
  approve(
    @Param('conversationId', { schema: conversationIdSchema }) id: string,
    @Param('confirmationId', { schema: addressConfirmationIdSchema })
    confirmationId: string,
    @Body({ schema: conversationApprovalSchema }) body: { requestId: string },
    @Req() request: CustomerRequest,
  ) {
    return this.conversations.approve(
      id,
      confirmationId,
      body.requestId,
      request,
    );
  }
}
