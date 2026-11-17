import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiAgents } from '@nestjs/ai/workflows';
import {
  WorkflowClient,
  WorkflowIdConflictError,
  type WorkflowStartResult,
} from '@nestjs/workflows';
import { randomUUID } from 'node:crypto';
import {
  pendingRefundApprovalsResponseSchema,
  refundDecisionResponseSchema,
  refundRequestResponseSchema,
  type PendingRefundApproval,
  type RefundDecisionResponse,
  type RefundRequestResponse,
} from '@cat-supplies-store/contracts';
import { OrdersService } from '../orders/orders.service';
import {
  refundWorkflow,
  type RefundWorkflowInput,
} from '@cat-supplies-store/refunds/contract';

@Injectable()
export class RefundsService {
  constructor(
    private readonly workflows: WorkflowClient,
    private readonly agents: AiAgents,
    private readonly orders: OrdersService,
  ) {}

  async requestRefund(
    customerId: string,
    orderId: string,
    reason: string,
  ): Promise<RefundRequestResponse> {
    const proposedRequestId = `refund-${randomUUID()}`;
    let reservation = await this.orders.reserveRefundRequest(
      customerId,
      orderId,
      proposedRequestId,
    );
    if (reservation.status === 'not_found') {
      throw new NotFoundException('Refundable order not found.');
    }

    if (reservation.requestId !== proposedRequestId) {
      const existing = await this.workflows.getStatus(reservation.requestId);
      if (
        existing?.workflow === refundWorkflow.name &&
        ['completed', 'failed', 'cancelled', 'compensation_failed'].includes(
          existing.status,
        )
      ) {
        await this.orders.releaseRefundRequest(reservation.requestId);
        reservation = await this.orders.reserveRefundRequest(
          customerId,
          orderId,
          proposedRequestId,
        );
        if (reservation.status === 'not_found') {
          throw new NotFoundException('Refundable order not found.');
        }
      }
    }

    const input = {
      customerId,
      orderId,
      reason,
      refundRequestId: reservation.requestId,
    } satisfies RefundWorkflowInput;
    let started: Pick<WorkflowStartResult, 'id' | 'status'>;
    try {
      started = await this.workflows.start(refundWorkflow.name, input, {
        id: reservation.requestId,
        version: refundWorkflow.version,
        timeout: refundWorkflow.timeout,
      });
    } catch (error) {
      if (!(error instanceof WorkflowIdConflictError)) throw error;
      const existing = await this.workflows.getStatus(reservation.requestId);
      if (!existing || existing.workflow !== refundWorkflow.name) {
        throw new ConflictException('A refund request is already pending.');
      }
      started = existing;
    }
    return refundRequestResponseSchema.parse({
      runId: started.id,
      status: started.status,
    });
  }

  async pendingApprovals(runId: string): Promise<PendingRefundApproval[]> {
    const instance = await this.workflows.getStatus(runId);
    if (!instance || instance.workflow !== refundWorkflow.name) {
      throw new NotFoundException('Refund request not found.');
    }
    return pendingRefundApprovalsResponseSchema.parse(
      await this.agents.pendingApprovals(runId),
    );
  }

  async decide(
    runId: string,
    approvalKey: string,
    approved: boolean,
    reason: string,
  ): Promise<RefundDecisionResponse> {
    const pending = await this.pendingApprovals(runId);
    if (!pending.some((approval) => approval.key === approvalKey)) {
      throw new NotFoundException('Pending refund approval not found.');
    }
    if (approved) {
      await this.agents.approve(approvalKey, { by: 'support-reviewer' });
      return refundDecisionResponseSchema.parse({ runId, approved: true });
    }
    await this.agents.reject(approvalKey, {
      reason,
      by: 'support-reviewer',
    });
    await this.orders.releaseRefundRequest(runId);
    return refundDecisionResponseSchema.parse({ runId, approved: false });
  }
}
