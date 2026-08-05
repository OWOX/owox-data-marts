/**
 * Authority level at which a plugin was made discoverable in the Gallery.
 *
 * These three are independently managed and combine into one deduplicated Gallery
 * per member. The combined Gallery is deliberately not a scope of its own.
 */
export enum PluginPublicationScope {
  /** Allowlisted publisher key. Audience is either selected projects or all of them. */
  DEPLOYMENT = 'deployment',
  /** Project Admin, for their own project only. */
  PROJECT = 'project',
  /** Any project member, visible only to themselves. */
  MEMBER = 'member',
}
