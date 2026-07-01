import { UserPlus } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../../shared/components/CollapsibleCard';
import { useMembersSettings } from '../../model/members-settings.context';
import { MembershipRequestRow } from './MembershipRequestRow';

// Kept in sync with apps/web/e2e/selectors/testids.ts -> TESTIDS.pendingRequestsSection.
// Src must not import from e2e/ (test-only tree); the contract is a literal string.
const TESTID = 'pendingRequestsSection';

export function PendingRequestsSection() {
  const { isAdmin, pendingRequests, openMembershipRequestSheet } = useMembersSettings();

  if (!isAdmin) return null;
  if (pendingRequests.length === 0) return null;

  return (
    <section aria-labelledby='pending-requests-heading' data-testid={TESTID}>
      <CollapsibleCard collapsible defaultCollapsed={false}>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={UserPlus}>
            <span id='pending-requests-heading'>Access requests</span>
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex flex-col gap-2'>
            {pendingRequests.map(request => (
              <MembershipRequestRow
                key={request.requestId}
                request={request}
                onClick={openMembershipRequestSheet}
              />
            ))}
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>
    </section>
  );
}
