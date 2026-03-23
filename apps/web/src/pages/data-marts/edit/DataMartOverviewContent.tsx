import { useOutletContext } from 'react-router-dom';
import { DataMartOverview } from '../../../features/data-marts/edit';
import { OwnersEditor } from '../../../features/data-marts/edit/components/OwnersEditor';
import { UserReference } from '../../../shared/components/UserReference/UserReference';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../shared/components/CollapsibleCard';
import { BookOpenIcon, Users } from 'lucide-react';
import type { UserProjectionDto } from '../../../shared/types/api';

interface OutletContextType {
  dataMart: {
    id: string;
    description: string;
    createdAt: Date;
    createdByUser: UserProjectionDto | null;
    businessOwnerUsers: UserProjectionDto[];
    technicalOwnerUsers: UserProjectionDto[];
  };
  updateDataMartOwners: (
    id: string,
    businessOwnerIds: string[],
    technicalOwnerIds: string[]
  ) => Promise<void>;
  projectId: string;
}

export default function DataMartOverviewContent() {
  const { dataMart, updateDataMartOwners, projectId } = useOutletContext<OutletContextType>();

  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard collapsible name='owners'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={Users} tooltip='Data mart ownership and responsibility'>
            Owners
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex flex-col gap-4 pb-4'>
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground w-36 text-sm whitespace-nowrap'>
                Created at
              </span>
              <span className='text-sm'>
                {new Intl.DateTimeFormat('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                }).format(new Date(dataMart.createdAt))}
              </span>
            </div>
            {dataMart.createdByUser && (
              <div className='flex items-center gap-2'>
                <span className='text-muted-foreground w-36 text-sm whitespace-nowrap'>
                  Created by
                </span>
                <UserReference userProjection={dataMart.createdByUser} variant='full' />
              </div>
            )}
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground w-36 text-sm whitespace-nowrap'>
                Business Owner
              </span>
              <OwnersEditor
                ownerUsers={dataMart.businessOwnerUsers}
                projectId={projectId}
                onSave={userIds => {
                  void updateDataMartOwners(
                    dataMart.id,
                    userIds,
                    dataMart.technicalOwnerUsers.map(u => u.userId)
                  );
                }}
              />
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground w-36 text-sm whitespace-nowrap'>
                Technical Owner
              </span>
              <OwnersEditor
                ownerUsers={dataMart.technicalOwnerUsers}
                projectId={projectId}
                onSave={userIds => {
                  void updateDataMartOwners(
                    dataMart.id,
                    dataMart.businessOwnerUsers.map(u => u.userId),
                    userIds
                  );
                }}
              />
            </div>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={BookOpenIcon} tooltip='Description of the Data Mart'>
            Description
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <DataMartOverview />
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>
    </div>
  );
}
