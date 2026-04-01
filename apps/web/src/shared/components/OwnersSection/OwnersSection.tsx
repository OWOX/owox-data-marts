import { useParams } from 'react-router-dom';
import { OwnersEditor } from '../../../features/data-marts/edit/components/OwnersEditor';
import type { UserProjectionDto } from '../../types/api';

interface OwnersSectionProps {
  ownerUsers: UserProjectionDto[];
  onSave: (ownerIds: string[]) => void;
  label?: string;
}

export function OwnersSection({ ownerUsers, onSave, label }: OwnersSectionProps) {
  const { projectId = '' } = useParams<{ projectId: string }>();

  if (!projectId) return null;

  return (
    <div className='space-y-1.5'>
      {label && <div className='text-sm font-medium'>{label}</div>}
      <OwnersEditor ownerUsers={ownerUsers} projectId={projectId} onSave={onSave} />
    </div>
  );
}
