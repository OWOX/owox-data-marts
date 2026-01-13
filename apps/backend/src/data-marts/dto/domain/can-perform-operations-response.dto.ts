import { z } from 'zod';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';

/**
 * Zod schema for can-perform-operations response from Balance API.
 * Validates runtime data structure and provides TypeScript type inference.
 */
export const CanPerformOperationsResponseSchema = z.object({
  allowed: z.boolean(),
  blockedReasons: z.array(z.nativeEnum(ProjectBlockedReason)),
});

/**
 * TypeScript type inferred from CanPerformOperationsResponseSchema.
 */
export type CanPerformOperationsResponseDto = z.infer<typeof CanPerformOperationsResponseSchema>;
