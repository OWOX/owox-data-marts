import { Badge } from '@owox/ui/components/badge';
import { TriangleAlert } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../shared/components/CollapsibleCard';
import { formatDateShort } from '../../../utils/date-formatters';
import type { ReleaseIssues } from '../rejections';

/**
 * Why the deployment refused this plugin's recent GitHub releases.
 *
 * Publisher-facing: it renders from management diagnostics, which only a publisher
 * receives. Without it a rejected release is indistinguishable from "Check now did
 * nothing" -- the plugin just stays on an old version with no explanation anywhere.
 */
export function PluginReleaseIssuesCard({ issues }: { issues: ReleaseIssues }) {
  return (
    <CollapsibleCard collapsible name='plugin-release-issues'>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle
          icon={TriangleAlert}
          tooltip='Why recent GitHub releases were not published'
        >
          Release issues
        </CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>

      <CollapsibleCardContent>
        <div className='flex flex-col gap-3'>
          <p className='text-muted-foreground max-w-prose text-sm'>
            These releases could not become the current version. The version before them stays
            active until a release passes every check.
          </p>
          <ul className='flex flex-col gap-3'>
            {issues.rejections.map(rejection => (
              <li
                key={rejection.githubReleaseId ?? `${rejection.tagName}-${rejection.code}`}
                className='flex flex-col gap-1'
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-sm font-medium'>{rejection.tagName}</span>
                  <Badge variant='secondary'>{rejection.code}</Badge>
                </div>
                <p className='text-muted-foreground max-w-prose text-sm'>{rejection.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </CollapsibleCardContent>

      <CollapsibleCardFooter
        left={
          issues.syncedAt ? (
            // Date and time, not date alone: after a manual Check now the date would
            // not move, and the publisher could not tell the card reflects it.
            <span className='text-muted-foreground text-sm'>
              As of the check on {formatDateShort(issues.syncedAt)}
            </span>
          ) : undefined
        }
      />
    </CollapsibleCard>
  );
}
