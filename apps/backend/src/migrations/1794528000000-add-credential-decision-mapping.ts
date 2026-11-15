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

export class AddCredentialDecisionMapping1794528000000 implements MigrationInterface {
  public readonly name = 'AddCredentialDecisionMapping1794528000000';

  // One statement per definition sets only the decision key, so an edit of another key that
  // a running pod saves at the same time is kept. SQLite and MySQL share this JSON syntax.
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [definitionId, model] of Object.entries(DECISION_MODELS)) {
      await queryRunner.query(
        `UPDATE credential
         SET aiModelMappings = JSON_SET(aiModelMappings, '$.decision', ?),
             aiModelMappingModes = JSON_SET(aiModelMappingModes, '$.decision', 'recommended'),
             aiModelMappingSources = JSON_SET(COALESCE(aiModelMappingSources, '{}'), '$.decision', 'catalog')
         WHERE definitionSource = 'builtin'
           AND definitionId = ?
           AND aiModelMappingModes IS NOT NULL
           AND (aiModelMappings->>'$.fast' IS NOT NULL
             OR aiModelMappings->>'$.reasoning' IS NOT NULL
             OR aiModelMappings->>'$.embedding' IS NOT NULL)
           AND aiModelMappings->>'$.decision' IS NULL
           AND aiModelMappingModes->>'$.decision' IS NULL`,
        [model, definitionId]
      );
    }
  }

  // Removes every decision entry, also one that a maintainer set, because older code refuses all.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE credential
       SET aiModelMappings = JSON_REMOVE(aiModelMappings, '$.decision'),
           aiModelMappingModes = JSON_REMOVE(aiModelMappingModes, '$.decision'),
           aiModelMappingSources = JSON_REMOVE(aiModelMappingSources, '$.decision')
       WHERE aiModelMappings->>'$.decision' IS NOT NULL
          OR aiModelMappingModes->>'$.decision' IS NOT NULL
          OR aiModelMappingSources->>'$.decision' IS NOT NULL`
    );
  }
}
