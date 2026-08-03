/**
 * Security-significant plugin lifecycle actions, all of which are audited.
 *
 * Installation is on this list because it is the act that grants a third-party page
 * the installing member's full API authority -- the most consequential action in the
 * design, not merely a preference toggle.
 */
export enum PluginAuditAction {
  PUBLISH = 'publish',
  UNPUBLISH = 'unpublish',
  INSTALL = 'install',
  RESTORE = 'restore',
  UNINSTALL = 'uninstall',
  /** A version became current for the deployment. */
  UPDATE = 'update',
  /** A check ran and activated nothing: up to date, throttled, or unable to reach GitHub. */
  UPDATE_CHECK = 'update_check',
  SUSPEND = 'suspend',
  RESUME = 'resume',
}
