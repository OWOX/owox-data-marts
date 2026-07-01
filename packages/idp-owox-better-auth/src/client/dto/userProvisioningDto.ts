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

const OwoxUserProvisioningExistingRequestSchema = z
  .object({
    role: RoleEnum,
    status: z.string().min(1),
  })
  .nullable();

export const OwoxUserProvisioningRequestAccessContextResponseSchema = z.object({
  decision: z.literal('request_access'),
  user: z.object({
    userUid: z.string().min(1),
    email: z.string().min(1),
  }),
  organization: z
    .object({
      name: z.string().min(1),
    })
    .nullable(),
  project: z.object({
    projectName: z.string().min(1),
    projectTitle: z.string().min(1),
  }),
  availableRoles: z.array(RoleEnum).nonempty(),
  defaultRole: RoleEnum,
  existingRequest: OwoxUserProvisioningExistingRequestSchema.optional(),
});

export type OwoxUserProvisioningRequestAccessContextResponse = z.infer<
  typeof OwoxUserProvisioningRequestAccessContextResponseSchema
>;

export const OwoxRequestProjectAccessRequestSchema = z.object({
  biUserId: z.string().min(1),
  role: RoleEnum,
});

export type OwoxRequestProjectAccessRequest = z.infer<typeof OwoxRequestProjectAccessRequestSchema>;

export const OwoxRequestProjectAccessResponseSchema = z.object({
  user: z.object({
    userUid: z.string().min(1),
  }),
  project: z.object({
    projectName: z.string().min(1),
    projectTitle: z.string().min(1),
  }),
  request: z.object({
    role: RoleEnum,
    status: z.string().min(1),
  }),
});

export type OwoxRequestProjectAccessResponse = z.infer<
  typeof OwoxRequestProjectAccessResponseSchema
>;

export const OwoxCreateNewProjectResponseSchema = z.object({
  projectName: z.string().min(1),
  projectTitle: z.string().min(1),
});

export type OwoxCreateNewProjectResponse = z.infer<typeof OwoxCreateNewProjectResponseSchema>;
