import { AgentBudgets } from '../../../common/ai-insights/agent/types';
import { PlanAgentInput } from '../agent/types';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { buildPlanSystemPrompt } from './plan.prompt';
import { buildQueryRepairSystemPrompt } from './query-repair.prompt';
import { buildSqlBuilderSystemPrompt } from './sql-builder.prompt';
import { StorageRelatedPromptResolver } from './storage-related-prompt.resolver';
import { StorageRelatedPromptSection } from './storage-related-prompt.types';

describe('StorageRelatedPromptResolver', () => {
  const resolver = new StorageRelatedPromptResolver();

  it('returns BigQuery addon for SQL builder section', () => {
    const prompt = resolver.resolve(
      StorageRelatedPromptSection.SQL_BUILDER_SYSTEM,
      DataStorageType.GOOGLE_BIGQUERY
    );

    expect(prompt).toContain('BigQuery nested/STRUCT SQL rules:');
  });

  it('maps legacy BigQuery storage type to BigQuery addon', () => {
    const prompt = resolver.resolve(
      StorageRelatedPromptSection.SQL_BUILDER_SYSTEM,
      DataStorageType.LEGACY_GOOGLE_BIGQUERY
    );

    expect(prompt).toContain('BigQuery nested/STRUCT SQL rules:');
  });

  it('returns empty addon for unsupported storage type', () => {
    const prompt = resolver.resolve(
      StorageRelatedPromptSection.SQL_BUILDER_SYSTEM,
      DataStorageType.SNOWFLAKE
    );

    expect(prompt).toBeNull();
  });
});

describe('Storage-related prompt injection', () => {
  const budgets: AgentBudgets = { maxRows: 30 };
  const resolver = new StorageRelatedPromptResolver();

  it('injects BigQuery rules into SQL builder system prompt for BigQuery', () => {
    const prompt = buildSqlBuilderSystemPrompt(
      budgets,
      resolver.resolve(
        StorageRelatedPromptSection.SQL_BUILDER_SYSTEM,
        DataStorageType.GOOGLE_BIGQUERY
      )
    );

    expect(prompt).toContain('Storage-specific rules (MUST follow):');
    expect(prompt).toContain('CTE scope and lineage rules:');
    expect(prompt).toContain('NEVER quote dotted paths as one identifier');
  });

  it('does not inject BigQuery rules into SQL builder system prompt for Snowflake', () => {
    const prompt = buildSqlBuilderSystemPrompt(
      budgets,
      resolver.resolve(StorageRelatedPromptSection.SQL_BUILDER_SYSTEM, DataStorageType.SNOWFLAKE)
    );

    expect(prompt).not.toContain('BigQuery nested/STRUCT SQL rules:');
    expect(prompt).not.toContain('CTE scope and lineage rules:');
  });

  it('injects BigQuery rules into query repair system prompt for BigQuery', () => {
    const prompt = buildQueryRepairSystemPrompt(
      budgets,
      resolver.resolve(
        StorageRelatedPromptSection.QUERY_REPAIR_SYSTEM,
        DataStorageType.GOOGLE_BIGQUERY
      )
    );

    expect(prompt).toContain('Storage-specific rules (MUST follow):');
    expect(prompt).toContain('BigQuery repair rules for nested/STRUCT fields:');
  });

  it('injects BigQuery rules into plan system prompt for BigQuery', () => {
    const planInput = {
      prompt: 'test',
      promptLanguage: 'en',
      rawSchema: {
        storageType: DataStorageType.GOOGLE_BIGQUERY,
      },
    } as unknown as PlanAgentInput;

    const prompt = buildPlanSystemPrompt(
      planInput,
      resolver.resolve(StorageRelatedPromptSection.PLAN_SYSTEM, DataStorageType.GOOGLE_BIGQUERY)
    );

    expect(prompt).toContain('Storage-specific rules (MUST follow):');
    expect(prompt).toContain('BigQuery nested/STRUCT planning rules:');
    expect(prompt).toContain('resolvedIdentifier must be a valid BigQuery field path expression');
  });
});
