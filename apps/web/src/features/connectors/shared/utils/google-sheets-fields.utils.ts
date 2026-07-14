export const GOOGLE_SHEETS_CONNECTOR_NAME = 'GoogleSheets';

export const GOOGLE_SHEETS_SYSTEM_FIELD_NAMES = [
  '_owox_row_number',
  '_owox_imported_at',
] satisfies string[];

const GOOGLE_SHEETS_SYSTEM_FIELD_NAME_SET = new Set<string>(GOOGLE_SHEETS_SYSTEM_FIELD_NAMES);

export function isGoogleSheetsSystemField(fieldName: string): boolean {
  return GOOGLE_SHEETS_SYSTEM_FIELD_NAME_SET.has(fieldName);
}

export function withoutGoogleSheetsSystemFields(fields: string[]): string[] {
  return fields.filter(fieldName => !isGoogleSheetsSystemField(fieldName));
}

export function withGoogleSheetsSystemFields(fields: string[]): string[] {
  const sheetFields = withoutGoogleSheetsSystemFields(fields);
  return [...GOOGLE_SHEETS_SYSTEM_FIELD_NAMES, ...sheetFields];
}

export function getGoogleSheetsSelectedFieldsForAvailableColumns(
  selectedFields: string[],
  availableFields: string[]
): string[] {
  const availableFieldNameSet = new Set(availableFields);
  const availableSystemFields = GOOGLE_SHEETS_SYSTEM_FIELD_NAMES.filter(fieldName =>
    availableFieldNameSet.has(fieldName)
  );
  const availableSheetFields = withoutGoogleSheetsSystemFields(availableFields);
  const selectedAvailableSheetFields = withoutGoogleSheetsSystemFields(selectedFields).filter(
    fieldName => availableFieldNameSet.has(fieldName)
  );

  return [
    ...availableSystemFields,
    ...(selectedAvailableSheetFields.length > 0
      ? selectedAvailableSheetFields
      : availableSheetFields),
  ];
}

export function getConnectorEffectiveFields(connectorName: string, fields: string[]): string[] {
  return connectorName === GOOGLE_SHEETS_CONNECTOR_NAME
    ? withGoogleSheetsSystemFields(fields)
    : fields;
}
