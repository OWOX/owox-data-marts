/**
 * Name of the technical view that stands in for a SQL Data Mart wherever a table name is needed
 * (output controls, joins, insights). One name per Data Mart, so every path refreshes the same view.
 */
export function technicalViewNameFor(dataMartId: string): string {
  return `view_${dataMartId.replace(/-/g, '_')}`;
}
