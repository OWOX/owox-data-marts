import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DataQualityConfig,
  DataQualityConfigSchema,
} from '../dto/schemas/data-quality/data-quality-config.schema';

const RunDataQualityRequestSchema = z
  .object({ config: DataQualityConfigSchema.nullable().optional() })
  .strict();

const BatchRunDataQualityRequestSchema = z
  .object({
    dataMartIds: z.array(z.string().min(1).max(255)).min(1),
  })
  .strict();

export interface RunDataQualityInput {
  hasConfig: boolean;
  config?: DataQualityConfig | null;
}

@Injectable()
export class DataQualityApiMapper {
  toReplacementConfig(value: unknown): DataQualityConfig | null {
    if (value === null) return null;
    return this.parse(DataQualityConfigSchema, value, 'config') as DataQualityConfig;
  }

  toRunInput(value: unknown): RunDataQualityInput {
    const parsed = this.parse(RunDataQualityRequestSchema, value ?? {}, 'run request');
    if (!Object.prototype.hasOwnProperty.call(parsed, 'config')) {
      return { hasConfig: false };
    }
    return { hasConfig: true, config: (parsed.config as DataQualityConfig | undefined) ?? null };
  }

  toBatchIds(value: unknown): string[] {
    const parsed = this.parse(BatchRunDataQualityRequestSchema, value, 'batch request');
    const ids = Array.from(new Set(parsed.dataMartIds));
    if (ids.length > 200) {
      throw new BadRequestException({
        message: 'batch request has invalid shape',
        details: { errors: [{ message: 'A maximum of 200 unique Data Mart ids is allowed' }] },
      });
    }
    return ids;
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: `${field} has invalid shape`,
        details: { errors: result.error.issues },
      });
    }
    return result.data;
  }
}
