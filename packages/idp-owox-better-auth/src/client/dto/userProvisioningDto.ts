import { RoleEnum } from '@owox/idp-protocol';
import { z } from 'zod';

const OwoxUserProvisioningModeSchema = z.enum(['automatic', 'manual']);

export const OwoxUserProvisioningSettingsResponseSchema = z.object({
  isApplicable: z.boolean(),
  organization: z
    .object({
      name: z.string(),
      mainProjectName: z.string().nullish(),
      mainProjectTitle: z.string().nullish(),
    })
    .nullable(),
  settings: z
    .object({
      mode: OwoxUserProvisioningModeSchema,
      defaultRole: RoleEnum,
    })
    .nullable(),
});

export type OwoxUserProvisioningSettingsResponse = z.infer<
  typeof OwoxUserProvisioningSettingsResponseSchema
>;

export const OwoxUpdateUserProvisioningSettingsRequestSchema = z.object({
  mode: OwoxUserProvisioningModeSchema,
  defaultRole: RoleEnum,
});

export type OwoxUpdateUserProvisioningSettingsRequest = z.infer<
  typeof OwoxUpdateUserProvisioningSettingsRequestSchema
>;
