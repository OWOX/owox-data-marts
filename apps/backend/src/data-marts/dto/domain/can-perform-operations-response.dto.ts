import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';

export interface CanPerformOperationsResponseDto {
  allowed: boolean;
  blockedReasons: ProjectBlockedReason[];
}
