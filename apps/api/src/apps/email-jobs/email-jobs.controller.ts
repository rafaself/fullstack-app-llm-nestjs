import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IdentityThrottlerGuard,
  IpThrottlerGuard,
} from '@cat-supplies-store/http';
import {
  createEmailJobSchema,
  type CreateEmailJob,
} from '@cat-supplies-store/contracts';
import { SupportApprovalGuard } from '../../auth/demo-auth.guard';
import { EmailJobsService } from './email-jobs.service';

@Controller('email-jobs')
@UseGuards(IpThrottlerGuard, SupportApprovalGuard, IdentityThrottlerGuard)
@Throttle({
  ip: { limit: 120, ttl: 60_000 },
  identity: { limit: 60, ttl: 60_000 },
})
export class EmailJobsController {
  constructor(private readonly jobs: EmailJobsService) {}

  @Post()
  @Throttle({
    ip: { limit: 30, ttl: 60_000 },
    identity: { limit: 10, ttl: 60_000 },
  })
  create(@Body({ schema: createEmailJobSchema }) input: CreateEmailJob) {
    return this.jobs.create(input.messageId);
  }

  @Get(':jobId')
  get(@Param('jobId') jobId: string) {
    return this.jobs.get(jobId);
  }
}
