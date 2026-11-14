import { MigrationInterface, QueryRunner } from 'typeorm';

// Existing AI Credentials get the recommended decision model.
// A maintainer can remove it in the Credential form.
// Rollback: an older image refuses an AI mapping edit for a Credential that has a decision entry.
// Run `migrations:down` with this image first, then deploy the older image.
const DECISION_MODELS: Record<string, string> = {
  openai: 'gpt-6-luna',
  gemini: 'gemini-decision-1',
  anthropic: 'claude-haiku-4-5-20251001',
};

type Json = Record<string, unknown>;
type Row = {
  id: string;
  aiModelMappings: string | Json | null;
  aiModelMappingModes: string | Json | null;
  aiModelMappingSources: string | Json | null;
};

// SQLite returns JSON columns as strings. MySQL can return objects.
const parse = (value: string | Json | null): Json | null =>
  typeof value === 'string' ? (JSON.parse(value) as Json) : value;
const isEmpty = (value: Json | null): boolean => !value || Object.keys(value).length === 0;

export class AddCredentialDecisionMapping1794528000000 implements MigrationInterface {
  public readonly name = 'AddCredentialDecisionMapping1794528000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of await this.selectRows(queryRunner)) {
      const mappings = parse(row.aiModelMappings);
      const modes = parse(row.aiModelMappingModes);
      if (isEmpty(mappings) && isEmpty(modes)) continue;
      if (mappings?.decision !== undefined || modes?.decision !== undefined) continue;

      const model = DECISION_MODELS[row.definitionId];
      await this.save(queryRunner, row.id, {
        mappings: { ...mappings, decision: model },
        modes: { ...modes, decision: 'recommended' },
        sources: { ...parse(row.aiModelMappingSources), decision: 'catalog' },
      });
    }
  }

  // Removes every decision entry, also one that a maintainer set, because older code refuses all.
  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Row[] = await queryRunner.query(
      `SELECT id, aiModelMappings, aiModelMappingModes, aiModelMappingSources
       FROM credential
       WHERE aiModelMappings IS NOT NULL OR aiModelMappingModes IS NOT NULL`
    );
    for (const row of rows) {
      const mappings = parse(row.aiModelMappings);
      const modes = parse(row.aiModelMappingModes);
      const sources = parse(row.aiModelMappingSources);
      if (
        mappings?.decision === undefined &&
        modes?.decision === undefined &&
        sources?.decision === undefined
      ) {
        continue;
      }

      const without = (value: Json | null): Json => {
        const { decision: _decision, ...rest } = value ?? {};
        return rest;
      };
      await this.save(queryRunner, row.id, {
        mappings: without(mappings),
        modes: without(modes),
        sources: sources ? without(sources) : null,
      });
    }
  }

  private async selectRows(
    queryRunner: QueryRunner
  ): Promise<Array<Row & { definitionId: string }>> {
    const ids = Object.keys(DECISION_MODELS);
    return queryRunner.query(
      `SELECT id, definitionId, aiModelMappings, aiModelMappingModes, aiModelMappingSources
       FROM credential
       WHERE definitionSource = ? AND definitionId IN (${ids.map(() => '?').join(', ')})`,
      ['builtin', ...ids]
    );
  }

  private async save(
    queryRunner: QueryRunner,
    id: string,
    value: { mappings: Json; modes: Json; sources: Json | null }
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE credential
       SET aiModelMappings = ?, aiModelMappingModes = ?, aiModelMappingSources = ?
       WHERE id = ?`,
      [
        JSON.stringify(value.mappings),
        JSON.stringify(value.modes),
        value.sources === null ? null : JSON.stringify(value.sources),
        id,
      ]
    );
  }
}
