import {
  createDataMartSchema,
  updateDataMartDefinitionSchema,
  updateDataMartTitleSchema,
  setDataMartOwnersSchema,
} from './data-mart.schemas';

describe('Data Mart management input', () => {
  it('rejects actor and project overrides', () => {
    expect(
      createDataMartSchema.safeParse({
        title: 'Orders',
        storage_id: 'storage',
        project_id: 'other',
      }).success
    ).toBe(false);
  });

  it('rejects empty titles', () => {
    expect(updateDataMartTitleSchema.safeParse({ data_mart_id: 'mart', title: '  ' }).success).toBe(
      false
    );
  });

  it('requires the definition to match the selected source type', () => {
    expect(
      updateDataMartDefinitionSchema.safeParse({
        data_mart_id: 'mart',
        definition_type: 'SQL',
        definition: { fullyQualifiedName: 'project.dataset.table' },
      }).success
    ).toBe(false);
  });

  it('rejects unknown definition properties instead of stripping them', () => {
    expect(
      updateDataMartDefinitionSchema.safeParse({
        data_mart_id: 'mart',
        definition_type: 'SQL',
        definition: { sqlQuery: 'SELECT 1', credentials: 'secret' },
      }).success
    ).toBe(false);
  });

  it('accepts a connector with a Credential reference', () => {
    expect(
      updateDataMartDefinitionSchema.safeParse({
        data_mart_id: 'mart',
        definition_type: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name: 'GoogleSheets',
              configuration: [{ _credential_id: 'credential', SpreadsheetId: 'sheet' }],
              node: 'sheet',
              fields: ['id'],
            },
            storage: { fullyQualifiedName: 'project.dataset.table' },
          },
        },
      }).success
    ).toBe(true);
  });

  it('requires both owner sets so omitted owners cannot silently disappear', () => {
    expect(
      setDataMartOwnersSchema.safeParse({ data_mart_id: 'mart', technical_owner_ids: ['member'] })
        .success
    ).toBe(false);
  });
});
