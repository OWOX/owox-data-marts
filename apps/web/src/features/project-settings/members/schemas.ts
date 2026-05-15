import { z } from 'zod';
import { PROJECT_ROLE_VALUES, ROLE_SCOPE_VALUES } from '../../../features/project-members/types';

export const memberRoleFormSchema = z.object({
  role: z.enum(PROJECT_ROLE_VALUES),
  roleScope: z.enum(ROLE_SCOPE_VALUES),
});

export type MemberRoleFormValues = z.infer<typeof memberRoleFormSchema>;
