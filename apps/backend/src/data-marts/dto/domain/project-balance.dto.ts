import { z } from 'zod';
import { ProjectPlanType } from '../../enums/project-plan-type.enum';

/**
 * Zod schema for project balance response from Balance API.
 * Validates runtime data structure and provides TypeScript type inference.
 */
export const ProjectBalanceSchema = z.object({
  subscriptionPlanType: z.nativeEnum(ProjectPlanType),
  availableCredits: z.number(),
  consumedCredits: z.number(),
  creditUsagePercentage: z.number(),
});

/**
 * TypeScript type inferred from ProjectBalanceSchema.
 */
export type ProjectBalanceDto = z.infer<typeof ProjectBalanceSchema>;
