/**
 * Enum for report conditions
 * Defines when a report should be triggered based on the result of a data mart
 */
export enum ReportCondition {
  ALWAYS = 'ALWAYS',
  RESULT_IS_EMPTY = 'RESULT_IS_EMPTY',
  RESULT_IS_NOT_EMPTY = 'RESULT_IS_NOT_EMPTY',
}
