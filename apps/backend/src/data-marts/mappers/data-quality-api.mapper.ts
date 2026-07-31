import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DataQualityConfig,
  DataQualityConfigSchema,
} from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRunDetailsDto } from '../dto/domain/data-quality.dto';
import {
  LatestDataQualityRunResponseApiDto,
  RunDataQualityRequestApiDto,
} from '../dto/presentation/data-quality-api.dto';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityScope } from '../enums/data-quality-scope.enum';

const BatchRunDataQualityRequestSchema = z
  .object({
    dataMartIds: z.array(z.string().min(1).max(255)).min(1),
  })
  .strict();
const RunDataQualityRequestSchema = z
  .object({
    configRevision: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .strict();

const REDACTED_RELATIONSHIP_DESCRIPTION =
  'Relationship check details are hidden because the target Data Mart is not accessible.';
const REDACTED_RELATIONSHIP_ERROR_MESSAGE =
  'Relationship check error details are hidden because the target Data Mart is not accessible.';

@Injectable()
export class DataQualityApiMapper {
  toReplacementConfig(value: unknown): DataQualityConfig | null {
    if (value === null) return null;
    return this.parse(DataQualityConfigSchema, value, 'config') as DataQualityConfig;
  }

  toRunRequest(value: unknown): RunDataQualityRequestApiDto | undefined {
    if (value === undefined) return undefined;
    return this.parse(RunDataQualityRequestSchema, value, 'run request');
  }

  toBatchIds(value: unknown): string[] {
    const parsed = this.parse(BatchRunDataQualityRequestSchema, value, 'batch request');
    return Array.from(new Set(parsed.dataMartIds));
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
        sql: redacted ? null : result.sql,
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
      snapshot: {
        config: {
          rules: run.dataQualitySnapshot.config.rules.map(rule => ({
            ...rule,
            scope:
              rule.scope.type === DataQualityScope.FIELD
                ? { ...rule.scope, fieldPath: [...rule.scope.fieldPath] }
                : { ...rule.scope },
            parameters: { ...rule.parameters },
          })),
        },
        schema: run.dataQualitySnapshot.schema
          ? structuredClone(run.dataQualitySnapshot.schema)
          : null,
        relationships: run.dataQualitySnapshot.relationships.map(relationship => ({
          id: relationship.id,
          sourceDataMartId: relationship.sourceDataMartId,
          targetDataMartId: relationship.targetDataMartId,
          targetAlias: relationship.targetAlias,
          joinConditions: relationship.joinConditions.map(condition => ({ ...condition })),
          ...(relationship.targetAccessible === undefined
            ? {}
            : { targetAccessible: relationship.targetAccessible }),
        })),
        definitionType: run.dataQualitySnapshot.definitionType,
      },
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
