// OW_MANIFEST and OW_CONFIG must each stay below Linux's 128 KiB limit for one environment string.
export const MAX_MANIFEST_SIZE_BYTES = 120 * 1024;

// Must match the VARCHAR(255) and TEXT columns in connector_definitions.
export const MAX_VARCHAR_LENGTH = 255;
export const MAX_TEXT_COLUMN_BYTES = 65535;
