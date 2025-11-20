/**
 * Enumeration representing various conditions for generating a report.
 * This enum is typically used to specify under which circumstances a report should be delivered to a user.
 *
 * Members:
 * - `ALWAYS`: Specifies that the report should be generated regardless of any conditions.
 * - `RESULT_IS_EMPTY`: Specifies that the report should be generated only when the result is empty.
 * - `RESULT_IS_NOT_EMPTY`: Specifies that the report should be generated only when the result is not empty.
 */
export enum ReportConditionEnum {
  ALWAYS = 'ALWAYS',
  RESULT_IS_EMPTY = 'RESULT_IS_EMPTY',
  RESULT_IS_NOT_EMPTY = 'RESULT_IS_NOT_EMPTY',
}
