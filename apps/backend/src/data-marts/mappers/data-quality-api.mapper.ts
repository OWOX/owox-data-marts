import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DataQualityConfig,
  DataQualityConfigSchema,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRunDetailsDto } from '../dto/domain/data-quality.dto';
import { LatestDataQualityRunResponseApiDto } from '../dto/presentation/data-quality-api.dto';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityScope } from '../enums/data-quality-scope.enum';

const RunDataQualityRequestSchema = z
  .object({ config: DataQualityConfigSchema.nullable().optional() })
  .strict();

const BatchRunDataQualityRequestSchema = z
  .object({
    dataMartIds: z.array(z.string().min(1).max(255)).min(1),
  })
  .strict();

const REDACTED_RELATIONSHIP_DESCRIPTION =
  'Relationship check details are hidden because the target Data Mart is not accessible.';
const REDACTED_RELATIONSHIP_ERROR_MESSAGE =
  'Relationship check error details are hidden because the target Data Mart is not accessible.';

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

  toLatestResponse(run: DataMartRun): LatestDataQualityRunResponseApiDto {
    return {
      runId: run.id,
      summary: run.dataQualitySummary!,
      createdAt: run.createdAt,
      startedAt: run.startedAt ?? null,
      finishedAt: run.finishedAt ?? null,
    };
  }

  toRunDetails(
    run: DataMartRun,
    accessByTargetId: ReadonlyMap<string, boolean>
  ): DataQualityRunDetailsDto | null {
    if (!run.dataQualitySnapshot || !run.dataQualitySummary || !run.dataQualityResults) {
      return null;
    }

    const targetIdByRelationshipId = new Map(
      run.dataQualitySnapshot.relationships.map(snapshot => [
        snapshot.id,
        snapshot.targetDataMartId,
      ])
    );
    const results = run.dataQualityResults.map(result => {
      const targetId =
        result.scope.type === DataQualityScope.RELATIONSHIP
          ? targetIdByRelationshipId.get(result.scope.relationshipId)
          : undefined;
      const redacted =
        result.scope.type === DataQualityScope.RELATIONSHIP &&
        (targetId === undefined || accessByTargetId.get(targetId) !== true);

      return {
        ...result,
        description: redacted ? REDACTED_RELATIONSHIP_DESCRIPTION : result.description,
        examples: redacted
          ? []
          : result.examples.map(example => ({ ...example, values: { ...example.values } })),
        executedSql: redacted ? [] : [...result.executedSql],
        reproductionSql: redacted ? null : result.reproductionSql,
        error:
          redacted && result.error
            ? {
                code: result.error.code,
                message: REDACTED_RELATIONSHIP_ERROR_MESSAGE,
                details: null,
              }
            : result.error,
        redacted,
      };
    });

    return {
      snapshot: run.dataQualitySnapshot,
      summary: run.dataQualitySummary,
      results,
    };
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
