import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatMemberCount } from './member-access.utils';

interface MemberAccessWarningProps {
  /** How many members this setting keeps from seeing the Data Mart. Renders nothing at zero. */
  count: number;
  /** Why, and what to change. */
  children: ReactNode;
  testId: string;
}

/**
 * Says, at the setting that causes it, how many members cannot see the Data Mart — so the
 * consequence of a Sharing or Contexts choice is visible before anyone reports a missing Data Mart.
 */
export function MemberAccessWarning({ count, children, testId }: MemberAccessWarningProps) {
  if (count === 0) {
    return null;
  }

  return (
    <Alert data-testid={testId}>
      <TriangleAlert />
      <AlertTitle>{formatMemberCount(count)} can&apos;t see this Data Mart</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
