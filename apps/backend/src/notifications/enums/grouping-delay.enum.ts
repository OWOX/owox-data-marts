export enum GroupingDelayCron {
  FIVE_MINUTES = '*/5 * * * *',
  FIFTEEN_MINUTES = '*/15 * * * *',
  THIRTY_MINUTES = '*/30 * * * *',
  ONE_HOUR = '0 * * * *',
  TWO_HOURS = '0 */2 * * *',
  SIX_HOURS = '0 */6 * * *',
  TWELVE_HOURS = '0 */12 * * *',
  TWENTY_FOUR_HOURS = '0 0 * * *',
}

export const DEFAULT_GROUPING_DELAY_CRON = GroupingDelayCron.ONE_HOUR;
