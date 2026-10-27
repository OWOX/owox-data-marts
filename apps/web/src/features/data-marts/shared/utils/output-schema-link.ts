/** The Data Setup `section` value that opens a Data Mart's Output Schema card and scrolls to it. */
export const OUTPUT_SCHEMA_SECTION = 'output-schema';

/** Project-relative path to a Data Mart's Output Schema, opened and scrolled into view. */
export function outputSchemaPath(dataMartId: string): string {
  return `/data-marts/${dataMartId}/data-setup?section=${OUTPUT_SCHEMA_SECTION}`;
}
