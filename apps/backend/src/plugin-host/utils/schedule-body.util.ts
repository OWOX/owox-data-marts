import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type {
  PluginScheduleDraft,
  PluginSchedulePatch,
} from '../dto/domain/plugin-action-schedule.dto';

const FIELDS = {
  action: z.string(),
  // z.unknown() answers the value itself, so keys such as `__proto__` and `constructor` survive.
  parameters: z.unknown(),
  cron: z.string(),
  timeZone: z.string(),
  // A blank name is stored as no name.
  name: z
    .string()
    .trim()
    .transform(name => name || null)
    .nullable(),
};

const CreateScheduleBodySchema = z
  .object({ ...FIELDS, name: FIELDS.name.optional(), enabled: z.boolean().optional() })
  .strict();

const UpdateScheduleBodySchema = z.object(FIELDS).partial().strict();

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map(issue =>
        issue.code === 'unrecognized_keys'
          ? `property ${issue.keys.join(', ')} should not exist`
          : `${issue.path.join('.') || 'body'}: ${issue.message}`
      )
    );
  }
  return result.data;
}

export function parseCreateScheduleBody(body: unknown): {
  draft: PluginScheduleDraft;
  enabled: boolean;
} {
  const { enabled = true, name = null, ...draft } = parse(CreateScheduleBodySchema, body);
  return { draft: { ...draft, parameters: draft.parameters, name }, enabled };
}

export function parseUpdateScheduleBody(body: unknown): PluginSchedulePatch {
  return parse(UpdateScheduleBodySchema, body);
}
