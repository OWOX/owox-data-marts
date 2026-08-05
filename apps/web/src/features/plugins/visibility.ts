import type { PluginPublicationScope } from './types';

/**
 * Who, besides the reader, can find this plugin in the Gallery -- or why they can
 * trust a product-wide listing.
 */
export type PluginAudience = 'verified' | 'you' | 'project' | 'unlisted';

export interface GalleryVisibility {
  readonly audience: PluginAudience;
  /** Short enough to label the tooltip trigger for a screen reader. */
  readonly summary: string;
  /** One sentence a member can act on. */
  readonly detail: string;
  /** How the install dialog labels who listed it. */
  readonly listing: string;
}

/**
 * What a member should be told about why a plugin sits in their Gallery.
 *
 * Precedence is intentional and not a §10 ranking of publications: it is what the
 * *card* should say when several scopes apply at once.
 *
 * - **verified** (deployment): product-level admins listed it for the whole deployment.
 *   That is the trust signal, so it wins over personal or project reasons.
 * - **project**: available to every member of this project.
 * - **you**: only this member listed it for themselves.
 * - **unlisted**: reached by direct link with no active publication.
 */
export function describeVisibility(scopes: PluginPublicationScope[]): GalleryVisibility | null {
  if (scopes.includes('deployment')) {
    return {
      audience: 'verified',
      summary: 'Verified',
      // No product/admin story on the card yet -- just the trust mark.
      detail: 'Verified',
      listing: 'Verified',
    };
  }

  if (scopes.includes('project')) {
    return {
      audience: 'project',
      // Who listed it is not the reader's concern -- what they can do with it is.
      summary: 'Available to the project',
      detail: 'Available to every member of this project to install.',
      listing: 'Available to the whole project',
    };
  }

  if (scopes.includes('member')) {
    // A member publication is visible only to its own author (§8.3), so the reader is
    // necessarily the one who added it -- no lookup needed to say so.
    return {
      audience: 'you',
      summary: 'Only you can see it',
      detail: 'You added this plugin for yourself. No one else in the project sees it here.',
      listing: 'Added by you, for yourself',
    };
  }

  return {
    audience: 'unlisted',
    summary: 'Not in the Gallery',
    detail:
      'Nothing lists this plugin, so it is reachable only by direct link. Installing it does not list it for anyone.',
    listing: 'Not listed',
  };
}
