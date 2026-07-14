export const GOOGLE_SHEETS_CONNECTOR_NAME = 'GoogleSheets';

export const GOOGLE_SHEETS_IMPORT_ALL_COLUMNS_FIELD = 'ImportAllColumns';
export const GOOGLE_SHEETS_SELECTED_COLUMNS_FIELD = 'SelectedColumns';

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

export function getAvailableGoogleSheetsSelectedFields(
  selectedFields: string[],
  availableFields: string[]
): string[] {
  const availableFieldSet = new Set(availableFields);
  return selectedFields.filter(fieldName => availableFieldSet.has(fieldName));
}

export function reconcileGoogleSheetsPreviewSelection(
  selectedFields: string[],
  availableFields: string[],
  defaultFields: string[],
  importAllColumns = false
): string[] {
  const availableFieldSet = new Set(availableFields);
  if (importAllColumns) {
    const selectedFieldSet = new Set(selectedFields);
    const defaultFieldSet = new Set(defaultFields);
    return availableFields.filter(
      fieldName =>
        !isGoogleSheetsSystemField(fieldName) ||
        selectedFieldSet.has(fieldName) ||
        defaultFieldSet.has(fieldName)
    );
  }

  const fieldsToReconcile = selectedFields.length > 0 ? selectedFields : defaultFields;

  return fieldsToReconcile.filter(fieldName => availableFieldSet.has(fieldName));
}

export function resolveGoogleSheetsPreviewSelection(
  configuration: Record<string, unknown>,
  currentFields: string[],
  availableFields: string[],
  defaultFields: string[]
): string[] {
  const importAllColumns = isGoogleSheetsImportAllColumnsEnabled(configuration);
  const configuredSelection = importAllColumns ? [] : getGoogleSheetsSelectedColumns(configuration);
  const fieldsToPreserve = configuredSelection.length > 0 ? configuredSelection : currentFields;

  return reconcileGoogleSheetsPreviewSelection(
    fieldsToPreserve,
    availableFields,
    defaultFields,
    importAllColumns
  );
}

export function isGoogleSheetsImportAllColumnsEnabled(
  configuration: Record<string, unknown>
): boolean {
  const value = configuration[GOOGLE_SHEETS_IMPORT_ALL_COLUMNS_FIELD];
  return value !== false && value !== 0 && value !== 'false' && value !== '0';
}

export function getGoogleSheetsSelectedColumns(configuration: Record<string, unknown>): string[] {
  const value = configuration[GOOGLE_SHEETS_SELECTED_COLUMNS_FIELD];
  if (typeof value !== 'string') return [];

  return value
    .split(',')
    .map(fieldName => fieldName.trim())
    .filter(Boolean);
}

export function shouldImportAllGoogleSheetsColumns(
  selectedFields: string[],
  availableFields: string[]
): boolean {
  const availableUserFields = withoutGoogleSheetsSystemFields(availableFields);
  const selectedFieldSet = new Set(withoutGoogleSheetsSystemFields(selectedFields));

  return (
    availableUserFields.length > 0 &&
    availableUserFields.every(fieldName => selectedFieldSet.has(fieldName))
  );
}

export function withGoogleSheetsImportAllColumns(
  configuration: Record<string, unknown>,
  selectedFields: string[],
  availableFields: string[],
  previousSelectedFields: string[] = []
): Record<string, unknown> {
  const configuredSelection = getGoogleSheetsSelectedColumns(configuration);
  const previousSelection = configuredSelection.length
    ? configuredSelection
    : previousSelectedFields;
  const availableFieldSet = new Set(availableFields);
  const previousAvailableUserFields = withoutGoogleSheetsSystemFields(previousSelection).filter(
    fieldName => availableFieldSet.has(fieldName)
  );
  const selectedUserFields = withoutGoogleSheetsSystemFields(selectedFields);
  const selectionChanged = !haveSameFields(previousAvailableUserFields, selectedUserFields);
  const preserveSubsetMode =
    configuration[GOOGLE_SHEETS_IMPORT_ALL_COLUMNS_FIELD] === false && !selectionChanged;
  const importAllColumns = preserveSubsetMode
    ? false
    : shouldImportAllGoogleSheetsColumns(selectedFields, availableFields);
  const unavailablePreviousFields = previousSelection.filter(
    fieldName => !availableFieldSet.has(fieldName)
  );
  const selectedColumns = importAllColumns
    ? selectedFields
    : [...selectedFields, ...unavailablePreviousFields];

  return {
    ...configuration,
    [GOOGLE_SHEETS_IMPORT_ALL_COLUMNS_FIELD]: importAllColumns,
    [GOOGLE_SHEETS_SELECTED_COLUMNS_FIELD]: selectedColumns.join(','),
  };
}

function haveSameFields(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(fieldName => rightSet.has(fieldName));
}

export function isValidGoogleSheetsServiceAccountKey(value: unknown): boolean {
  if (value === SECRET_MASK) return true;
  if (typeof value !== 'string' || value.trim() === '') return false;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;

    const credentials = parsed as Record<string, unknown>;
    return (
      typeof credentials.client_email === 'string' &&
      credentials.client_email.trim() !== '' &&
      typeof credentials.private_key === 'string' &&
      credentials.private_key.trim() !== ''
    );
  } catch {
    return false;
  }
}

export function hasValidGoogleSheetsServiceAccountConfiguration(
  configuration: Record<string, unknown>
): boolean {
  const authType = configuration.AuthType;
  if (typeof authType !== 'object' || authType === null || Array.isArray(authType)) return true;

  const serviceAccount = (authType as Record<string, unknown>).service_account;
  if (
    typeof serviceAccount !== 'object' ||
    serviceAccount === null ||
    Array.isArray(serviceAccount)
  ) {
    return true;
  }

  return isValidGoogleSheetsServiceAccountKey(
    (serviceAccount as Record<string, unknown>).ServiceAccountKey
  );
}
import { SECRET_MASK } from '../../../../shared/constants/secrets';
