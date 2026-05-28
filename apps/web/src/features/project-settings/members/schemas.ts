import { z } from 'zod';
import { PROJECT_ROLE_VALUES, ROLE_SCOPE_VALUES } from '../../project-members/types';

export const memberRoleFormSchema = z.object({
  role: z.enum(PROJECT_ROLE_VALUES),
  roleScope: z.enum(ROLE_SCOPE_VALUES),
});

export type MemberRoleFormValues = z.infer<typeof memberRoleFormSchema>;

export const userProvisioningFormSchema = z
  .object({
    mode: z.enum(['automatic', 'manual'] as const),
    defaultRole: z.enum(PROJECT_ROLE_VALUES),
    roleScope: z.enum(ROLE_SCOPE_VALUES),
    contextIds: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (
      data.defaultRole !== 'admin' &&
      data.roleScope === 'selected_contexts' &&
      data.contextIds.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: 'array',
        inclusive: true,
        path: ['contextIds'],
        message: 'Select at least one context before saving Selected Contexts.',
      });
    }
  });

export type UserProvisioningFormData = z.infer<typeof userProvisioningFormSchema>;
