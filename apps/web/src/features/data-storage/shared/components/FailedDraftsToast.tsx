import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { buildProjectPath } from '../../../../utils/path.ts';
import type { PublishDraftFailureDto } from '../api/types';

export function FailedDraftsToast({
  triggerId,
  projectId,
  storageTitle,
  failures,
}: {
  triggerId: string;
  projectId: string | null;
  storageTitle: string;
  failures: PublishDraftFailureDto[];
}) {
  const count = failures.length;
  const uniqueErrors = new Set(failures.map(failure => failure.error));
  const reason = uniqueErrors.size === 1 ? `: ${[...uniqueErrors][0]}` : ' due to different errors';

  // Only the link needs a project id. Without one (auth still loading, or a
  // token refresh in flight) still report why publishing failed, rather than
  // dropping to a detail-free message.
  const draftsLink = projectId
    ? `${buildProjectPath(projectId, '/data-marts')}?${new URLSearchParams({
        filters: JSON.stringify([
          { f: 'storageTitle', o: 'eq', v: [storageTitle] },
          { f: 'status', o: 'eq', v: ['DRAFT'] },
        ]),
      }).toString()}`
    : null;

  return (
    <span>
      Failed to publish {count} Data Mart draft{count !== 1 ? 's' : ''}
      {reason}.{' '}
      {draftsLink ? (
        <>
          <Link
            to={draftsLink}
            className='underline underline-offset-4'
            onClick={() => {
              toast.dismiss(`${triggerId}-error`);
            }}
          >
            Review them
          </Link>{' '}
          and try again.
        </>
      ) : (
        'Review them in the Data Marts list and try again.'
      )}
    </span>
  );
}
