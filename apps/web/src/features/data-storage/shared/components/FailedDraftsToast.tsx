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
  projectId: string;
  storageTitle: string;
  failures: PublishDraftFailureDto[];
}) {
  const count = failures.length;
  const uniqueErrors = new Set(failures.map(failure => failure.error));
  const reason = uniqueErrors.size === 1 ? `: ${[...uniqueErrors][0]}` : ' due to different errors';

  const draftsLink = `${buildProjectPath(projectId, '/data-marts')}?${new URLSearchParams({
    filters: JSON.stringify([
      { f: 'storageTitle', o: 'eq', v: [storageTitle] },
      { f: 'status', o: 'eq', v: ['DRAFT'] },
    ]),
  }).toString()}`;

  return (
    <span>
      Failed to publish {count} Data Mart draft{count !== 1 ? 's' : ''}
      {reason}.{' '}
      <Link
        to={draftsLink}
        className='underline underline-offset-4'
        onClick={() => {
          toast.dismiss(`${triggerId}-error`);
        }}
      >
        Check them
      </Link>{' '}
      and try again.
    </span>
  );
}
