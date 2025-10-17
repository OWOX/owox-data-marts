import { MigrationInterface, QueryRunner } from 'typeorm';
import { ConnectorState } from '../data-marts/entities/connector-state.entity';
import { DataMart } from '../data-marts/entities/data-mart.entity';

export class UpdateConnectorStateToArray1760541557345 implements MigrationInterface {
  public readonly name = 'UpdateConnectorStateToArray1760541557345';

  private async selectConnectorStates(
    queryRunner: QueryRunner
  ): Promise<Array<{ id: string; datamartId: string; state: unknown }>> {
    return await queryRunner.manager
      .getRepository(ConnectorState)
      .createQueryBuilder('cs')
      .select('cs.id', 'id')
      .addSelect('cs.datamartId', 'datamartId')
      .addSelect('cs.state', 'state')
      .where('cs.state IS NOT NULL')
      .getRawMany<{ id: string; datamartId: string; state: unknown }>();
  }

  private async getDataMartDefinition(
    queryRunner: QueryRunner,
    datamartId: string
  ): Promise<Record<string, unknown> | undefined> {
    const result = await queryRunner.manager
      .getRepository(DataMart)
      .createQueryBuilder('dm')
      .select('dm.definition', 'definition')
      .where('dm.id = :id', { id: datamartId })
      .getRawOne<{ definition: unknown }>();

    if (!result?.definition) return undefined;

    try {
      return typeof result.definition === 'string'
        ? (JSON.parse(result.definition) as Record<string, unknown>)
        : (result.definition as Record<string, unknown>);
    } catch {
      return undefined;
    }
  }

  private getConfigurationIds(definition: Record<string, unknown> | undefined): string[] {
    if (!definition) return [];

    const connector = (definition.connector as Record<string, unknown> | undefined) || undefined;
    const source = (connector?.source as Record<string, unknown> | undefined) || undefined;
    const configuration = source?.configuration as unknown[] | undefined;

    if (!Array.isArray(configuration)) return [];

    return configuration
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(item => item._id as string)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  private tryParseState(value: unknown): Record<string, unknown> | undefined {
    try {
      return typeof value === 'string'
        ? (JSON.parse(value) as Record<string, unknown>)
        : (value as Record<string, unknown>);
    } catch {
      return undefined;
    }
  }

  private transformToNewFormat(
    stateObj: Record<string, unknown>,
    configIds: string[]
  ): Record<string, unknown> | null {
    if (stateObj.states && Array.isArray(stateObj.states)) {
      return null; // Already in new format
    }

    const now = new Date().toISOString();
    const states: Array<Record<string, unknown>> = [];

    // Transform old format to new format
    // Old format: { "at": "...", "state": {...} }
    // New format: { "at": "...", "states": [{_id, state, at}] }

    if (stateObj.state && typeof stateObj.state === 'object' && configIds.length > 0) {
      states.push({
        _id: configIds[0],
        state: stateObj.state,
        at: (stateObj.at as string) || now,
      });
    }

    return {
      at: (stateObj.at as string) || now,
      states,
    };
  }

  private transformToOldFormat(stateObj: Record<string, unknown>): Record<string, unknown> | null {
    if (!stateObj.states || !Array.isArray(stateObj.states)) {
      return null; // Already in old format or invalid
    }

    const states = stateObj.states as Array<Record<string, unknown>>;
    const firstState = states.length > 0 ? states[0] : null;

    return {
      at: firstState?.at || stateObj.at || new Date().toISOString(),
      state: firstState?.state || {},
    };
  }

  private async saveState(
    queryRunner: QueryRunner,
    id: string,
    state: Record<string, unknown>
  ): Promise<void> {
    const stateJson = JSON.stringify(state);
    await queryRunner.query(`UPDATE connector_state SET state = ? WHERE id = ?`, [stateJson, id]);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await this.selectConnectorStates(queryRunner);
    for (const row of rows) {
      const stateObj = this.tryParseState(row.state);
      if (!stateObj) continue;

      const definition = await this.getDataMartDefinition(queryRunner, row.datamartId);
      const configIds = this.getConfigurationIds(definition);

      const newFormat = this.transformToNewFormat(stateObj, configIds);
      if (!newFormat) continue;

      await this.saveState(queryRunner, row.id, newFormat);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await this.selectConnectorStates(queryRunner);
    for (const row of rows) {
      const stateObj = this.tryParseState(row.state);
      if (!stateObj) continue;

      const oldFormat = this.transformToOldFormat(stateObj);
      if (!oldFormat) continue;

      await this.saveState(queryRunner, row.id, oldFormat);
    }
  }
}
