import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { describeGoogleError } from './engine/bigquery-managed-storage.engine';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { InternalProjectBillingService } from '../services/project-billing/internal-project-billing.service';

const CACHE_TTL_MS = 60_000;

/** The subscription plan of a project, or null when billing cannot be read. */
@Injectable()
export class OwoxStoragePlanService {
  private readonly logger = new Logger(OwoxStoragePlanService.name);
  private readonly plans = new Map<string, { value: ProjectPlanType | null; expiresAt: number }>();

  constructor(private readonly moduleRef: ModuleRef) {}

  async planFor(projectId: string): Promise<ProjectPlanType | null> {
    const hit = this.plans.get(projectId);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await this.readPlan(projectId);
    this.plans.set(projectId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  private async readPlan(projectId: string): Promise<ProjectPlanType | null> {
    try {
      // Lazy: billing -> connectors -> data marts -> credentials resolver is a provider cycle.
      const billing = this.moduleRef.get(InternalProjectBillingService);
      return (await billing.getBalance(projectId)).subscriptionPlanType;
    } catch (error) {
      this.logger.warn(
        `Could not read the plan of project ${projectId} for OWOX Storage: ${describeGoogleError(error)}`
      );
      return null;
    }
  }
}
