import { ProjectPlanType } from '../../enums/project-plan-type.enum';

export interface ProjectBalanceDto {
  subscriptionPlanType: ProjectPlanType;
  availableCredits: number;
  consumedCredits: number;
  creditUsagePercentage: number;
}
