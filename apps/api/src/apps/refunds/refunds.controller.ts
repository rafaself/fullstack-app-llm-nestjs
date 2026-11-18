import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IdentityThrottlerGuard,
  IpThrottlerGuard,
} from '@cat-supplies-store/http';
import {
  refundDecisionSchema,
  refundRequestSchema,
  type RefundDecision,
  type RefundRequest,
} from '@cat-supplies-store/contracts';
import { CurrentCustomer } from '../../auth/current-customer.decorator';
import {
  DemoCustomerGuard,
  SupportApprovalGuard,
} from '../../auth/demo-auth.guard';
import type { DemoCustomer } from '../../auth/demo-auth.types';
import { RefundsService } from './refunds.service';

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post()
  @UseGuards(IpThrottlerGuard, DemoCustomerGuard, IdentityThrottlerGuard)
  @Throttle({
    ip: { limit: 30, ttl: 60_000 },
    identity: { limit: 10, ttl: 60_000 },
  })
  request(
    @CurrentCustomer() customer: DemoCustomer,
    @Body({ schema: refundRequestSchema }) input: RefundRequest,
  ) {
    return this.refunds.requestRefund(customer.id, input.orderId, input.reason);
  }

  @Get(':runId/approvals')
  @UseGuards(IpThrottlerGuard, SupportApprovalGuard, IdentityThrottlerGuard)
  @Throttle({
    ip: { limit: 60, ttl: 60_000 },
    identity: { limit: 30, ttl: 60_000 },
  })
  pending(@Param('runId') runId: string) {
    return this.refunds.pendingApprovals(runId);
  }

  @Post(':runId/approvals/:key')
  @UseGuards(IpThrottlerGuard, SupportApprovalGuard, IdentityThrottlerGuard)
  @Throttle({
    ip: { limit: 30, ttl: 60_000 },
    identity: { limit: 10, ttl: 60_000 },
  })
  decide(
    @Param('runId') runId: string,
    @Param('key') key: string,
    @Body({ schema: refundDecisionSchema }) input: RefundDecision,
  ) {
    return this.refunds.decide(runId, key, input.approved, input.reason ?? '');
  }
}
