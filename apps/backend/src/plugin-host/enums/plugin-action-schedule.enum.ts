export enum PluginScheduleDisabledReason {
  ACTION_NOT_DECLARED = 'ACTION_NOT_DECLARED',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  /** A project admin paused someone else's schedule; the plugin cannot resume it. */
  PAUSED_BY_ADMIN = 'PAUSED_BY_ADMIN',
}
