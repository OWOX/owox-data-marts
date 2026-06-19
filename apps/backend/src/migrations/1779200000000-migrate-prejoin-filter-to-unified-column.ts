import { MigrationInterface, QueryRunner } from 'typeorm';
import { Report } from '../data-marts/entities/report.entity';

type Rule = Record<string, unknown>;

export class MigratePreJoinFilterToUnifiedColumn1779200000000 implements MigrationInterface {
  public readonly name = 'MigratePreJoinFilterToUnifiedColumn1779200000000';

  private parse(value: unknown): Rule[] | undefined {
    if (value == null) return undefined;
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? (parsed as Rule[]) : undefined;
    } catch {
      return undefined;
    }
  }

  // Folds a pre-join (slice) rule's aliasPath + raw column into the unified column
  // identifier (`<aliasPath dots->_>__<column dots->_>`) and drops aliasPath. Returns
  // true if anything changed. Inlined (not shared) so the migration stays self-contained.
  private migrateRules(rules: Rule[]): boolean {
    let changed = false;
    for (const rule of rules) {
      if (rule.placement === 'pre-join' && typeof rule.aliasPath === 'string') {
        const aliasPath = rule.aliasPath;
        const column = String(rule.column);
        rule.column = `${aliasPath.replace(/\./g, '_')}__${column.replace(/\./g, '_')}`;
        delete rule.aliasPath;
        changed = true;
      }
    }
    return changed;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.manager
      .getRepository(Report)
      .createQueryBuilder('r')
      .select('r.id', 'id')
      .addSelect('r.filterConfig', 'filterConfig')
      .where('r.filterConfig IS NOT NULL')
      .getRawMany<{ id: string; filterConfig: unknown }>();

    for (const row of rows) {
      const rules = this.parse(row.filterConfig);
      if (!rules || !this.migrateRules(rules)) continue;
      // Write goes through the filterConfig Zod column transformer — migrated rules are
      // valid by construction (previously-valid rules with aliasPath removed). This also
      // bumps version/modifiedAt, which is acceptable for a one-shot migration.
      await queryRunner.manager
        .getRepository(Report)
        .createQueryBuilder()
        .update()
        .set({ filterConfig: rules as Report['filterConfig'] })
        .where('id = :id', { id: row.id })
        .execute();
    }
  }

  // Forward-only: the unified name is lossy (nested-field dots collapse to '_'),
  // so the reverse split cannot reliably reconstruct aliasPath + raw column. No-op.
  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
