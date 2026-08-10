import { BadgeCheck, Link2Off, Lock, Users } from 'lucide-react';
import type { PluginAudience } from '../visibility';

/**
 * The mark for who, besides the reader, can find a plugin. Distinct glyphs rather than one
 * icon in states -- each audience is a different idea -- and shared by the Gallery card and
 * the plugin page so the two never drift apart.
 *
 * - verified (badge-check): deployment admins listed it product-wide.
 * - you (lock): only this member listed it, for themselves.
 * - project (users): available to every member of the project.
 * - unlisted (link-off): reached by direct link, listed by nobody.
 */
export function AudienceIcon({
  audience,
  className = 'size-4',
}: {
  audience: PluginAudience;
  className?: string;
}) {
  if (audience === 'verified') {
    return <BadgeCheck className={className} aria-hidden />;
  }
  if (audience === 'you') {
    return <Lock className={className} aria-hidden />;
  }
  if (audience === 'project') {
    return <Users className={className} aria-hidden />;
  }

  return <Link2Off className={className} aria-hidden />;
}
