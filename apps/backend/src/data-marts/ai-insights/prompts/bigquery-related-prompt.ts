import { StorageRelatedPromptSection } from './storage-related-prompt.types';

const BIGQUERY_PLAN_SYSTEM_PROMPT = `
BigQuery nested/STRUCT planning rules:
- If a required column is nested, keep the logical path in requiredColumns (for example "parent.child").
- requiredColumnsMeta[column].resolvedIdentifier must be a valid BigQuery field path expression:
  - use parent.child or \`parent\`.\`child\`
  - NEVER use a single backticked dotted identifier like \`parent.child\`
- If downstream logic relies on flattened names, plan stable aliases (for example parent_child)
  and keep references consistent in grouping/orderBy specs.
`.trim();

const BIGQUERY_SQL_BUILDER_SYSTEM_PROMPT = `
BigQuery nested/STRUCT SQL rules:
- Access nested fields as a path: parent.child or \`parent\`.\`child\`.
- NEVER quote dotted paths as one identifier: \`parent.child\` is treated as a flat column name.

CTE scope and lineage rules:
- After each CTE boundary, only columns projected by that CTE are available downstream.
- If a CTE defines parent.child AS parent_child, downstream references MUST use parent_child.
- Do not reference parent struct containers downstream unless explicitly projected again.
- Before final SQL output, validate that every SELECT/WHERE/GROUP BY/ORDER BY reference exists in current FROM scope.
`.trim();

const BIGQUERY_QUERY_REPAIR_SYSTEM_PROMPT = `
BigQuery repair rules for nested/STRUCT fields:
- Fix invalid dotted-identifier quoting: replace \`parent.child\` with parent.child (or \`parent\`.\`child\`).
- Repair CTE-scope errors by using names available in the current CTE output only.
- If an upstream CTE flattened nested fields via aliases (for example parent_child), use those aliases downstream.
- Do not re-introduce original struct paths downstream when they are no longer present in the CTE output.
`.trim();

export const BIGQUERY_RELATED_PROMPTS: Readonly<Record<StorageRelatedPromptSection, string>> = {
  [StorageRelatedPromptSection.PLAN_SYSTEM]: BIGQUERY_PLAN_SYSTEM_PROMPT,
  [StorageRelatedPromptSection.SQL_BUILDER_SYSTEM]: BIGQUERY_SQL_BUILDER_SYSTEM_PROMPT,
  [StorageRelatedPromptSection.QUERY_REPAIR_SYSTEM]: BIGQUERY_QUERY_REPAIR_SYSTEM_PROMPT,
};
