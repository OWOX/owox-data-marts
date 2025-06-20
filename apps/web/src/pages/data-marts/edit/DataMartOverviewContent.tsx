import { DataMartOverview } from '../../../features/data-marts/edit';
import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent.tsx';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader.tsx';
import { CollapsibleCardFooter } from '../../../shared/components/CollapsibleCard/CollapsibleCardFooter.tsx';
import { BookOpenIcon } from 'lucide-react';

export default function DataMartOverviewContent() {
  return (
    <CollapsibleCard>
      <CollapsibleCardHeader icon={BookOpenIcon} title={'Description'}></CollapsibleCardHeader>
      <CollapsibleCardContent>
        <DataMartOverview />
      </CollapsibleCardContent>
      <CollapsibleCardFooter></CollapsibleCardFooter>
    </CollapsibleCard>
  );
}
