import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { AiWorkflowsModule } from '@nestjs/ai/workflows';
import { RefundRequestWorkflow } from './refund.workflow.js';
import {
  REFUND_ISSUER,
  RefundTools,
  type RefundIssuer,
} from './refund.tools.js';

@Module({})
export class RefundExecutionModule {
  static register(issuer: Type<RefundIssuer>): DynamicModule {
    return {
      module: RefundExecutionModule,
      imports: [AiWorkflowsModule],
      providers: [
        RefundRequestWorkflow,
        RefundTools,
        { provide: REFUND_ISSUER, useClass: issuer },
      ],
    };
  }
}
