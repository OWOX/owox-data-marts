import { z } from 'zod-v4';
import type { ContextDto, ContextImpactDto } from '../../../../data-marts/dto/domain/context.dto';
import { contextIconOutputSchema } from './context.schemas';

export const contextOutputSchema = {
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: contextIconOutputSchema,
  created_by_id: z.string().nullable(),
  created_by_user: z
    .object({
      user_id: z.string(),
      full_name: z.string().nullable(),
      email: z.string().nullable(),
      avatar: z.string().nullable(),
    })
    .nullable(),
  created_at: z.string(),
  modified_at: z.string(),
};

export const contextImpactOutputSchema = {
  context_id: z.string(),
  context_name: z.string(),
  data_mart_count: z.number(),
  storage_count: z.number(),
  destination_count: z.number(),
  member_count: z.number(),
  user_provisioning_defaults_count: z.number(),
  affected_member_ids: z
    .array(z.string())
    .describe(
      'Members with selected-context access whose only assigned Context is this one; removing the assignment leaves them without shared access through Contexts.'
    ),
};

export class ContextToolMapper {
  toOutput(dto: ContextDto) {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description,
      icon: dto.icon,
      created_by_id: dto.createdById,
      created_by_user: dto.createdByUser
        ? {
            user_id: dto.createdByUser.userId,
            full_name: dto.createdByUser.fullName ?? null,
            email: dto.createdByUser.email ?? null,
            avatar: dto.createdByUser.avatar ?? null,
          }
        : null,
      created_at: dto.createdAt.toISOString(),
      modified_at: dto.modifiedAt.toISOString(),
    };
  }

  toImpactOutput(dto: ContextImpactDto) {
    return {
      context_id: dto.contextId,
      context_name: dto.contextName,
      data_mart_count: dto.dataMartCount,
      storage_count: dto.storageCount,
      destination_count: dto.destinationCount,
      member_count: dto.memberCount,
      user_provisioning_defaults_count: dto.userProvisioningDefaultsCount,
      affected_member_ids: dto.affectedMemberIds,
    };
  }
}
