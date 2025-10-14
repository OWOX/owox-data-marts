import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { DataMart } from '../data-marts/entities/data-mart.entity';

export class BackfillConnectorConfigIds1760007800968 implements MigrationInterface {
  public readonly name = 'BackfillConnectorConfigIds1760007800968';

  private async selectConnectorDataMarts(
    queryRunner: QueryRunner
  ): Promise<Array<{ id: string; definition: unknown }>> {
    return await queryRunner.manager
      .getRepository(DataMart)
      .createQueryBuilder('dm')
      .select('dm.id', 'id')
      .addSelect('dm.definition', 'definition')
      .where('dm.definitionType = :type', { type: 'CONNECTOR' })
      .andWhere('dm.definition IS NOT NULL')
      .andWhere('dm.deletedAt IS NULL')
      .getRawMany<{ id: string; definition: unknown }>();
  }

  private tryParseDefinition(value: unknown): Record<string, unknown> | undefined {
    try {
      return typeof value === 'string'
        ? (JSON.parse(value) as Record<string, unknown>)
        : (value as Record<string, unknown>);
    } catch {
      return undefined;
    }
  }

  private getConfigurationArray(
    def: Record<string, unknown> | undefined
  ): Array<unknown> | undefined {
    const connector = (def?.connector as Record<string, unknown> | undefined) || undefined;
    const source = (connector?.source as Record<string, unknown> | undefined) || undefined;
    return source?.configuration as unknown as Array<unknown> | undefined;
  }

  private addMissingIds(def: Record<string, unknown>): boolean {
    const config = this.getConfigurationArray(def);
    if (!Array.isArray(config)) return false;
    let changed = false;
    for (const item of config) {
      if (!item || typeof item !== 'object') continue;
      const objectItem = item as Record<string, unknown>;
      const hasValidId =
        typeof objectItem._id === 'string' && (objectItem._id as string).length > 0;
      if (!hasValidId) {
        objectItem._id = randomUUID();
        changed = true;
      }
    }
    return changed;
  }

  private removeIds(def: Record<string, unknown>): boolean {
    const config = this.getConfigurationArray(def);
    if (!Array.isArray(config)) return false;
    let changed = false;
    for (const item of config) {
      if (!item || typeof item !== 'object') continue;
      const objectItem = item as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(objectItem, '_id')) {
        delete objectItem._id;
        changed = true;
      }
    }
    return changed;
  }

  private async saveDefinition(
    queryRunner: QueryRunner,
    id: string,
    def: Record<string, unknown>
  ): Promise<void> {
    await queryRunner.manager
      .getRepository(DataMart)
      .createQueryBuilder()
      .update()
      .set({ definition: def as DataMart['definition'] })
      .where('id = :id', { id })
      .execute();
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await this.selectConnectorDataMarts(queryRunner);
    for (const row of rows) {
      const def = this.tryParseDefinition(row.definition);
      if (!def) continue;
      const changed = this.addMissingIds(def);
      if (!changed) continue;
      await this.saveDefinition(queryRunner, row.id, def);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    const rows = await this.selectConnectorDataMarts(_queryRunner);
    for (const row of rows) {
      const def = this.tryParseDefinition(row.definition);
      if (!def) continue;
      const changed = this.removeIds(def);
      if (!changed) continue;
      await this.saveDefinition(_queryRunner, row.id, def);
    }
  }
}
