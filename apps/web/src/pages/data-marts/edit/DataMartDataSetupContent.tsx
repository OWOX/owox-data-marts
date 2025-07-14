import {
  DataMartDataStorageView,
  DataMartDefinitionSettings,
  DataMartSchemaSettings,
} from '../../../features/data-marts/edit';
import { useDataMartContext } from '../../../features/data-marts/edit/model';
import { CollapsibleCard } from '../../../shared/components/CollapsibleCard';
import { CollapsibleCardContent } from '../../../shared/components/CollapsibleCard/CollapsibleCardContent.tsx';
import { CollapsibleCardHeader } from '../../../shared/components/CollapsibleCard/CollapsibleCardHeader.tsx';
import { CollapsibleCardFooter } from '../../../shared/components/CollapsibleCard/CollapsibleCardFooter.tsx';
import { DatabaseIcon, CodeIcon, Columns3 } from 'lucide-react';

export default function DataMartDataSetupContent() {
  const { dataMart, updateDataMartStorage } = useDataMartContext();

  return (
    <div className={'flex flex-col gap-4'}>
      <CollapsibleCard collapsible name={'data-storage'}>
        <CollapsibleCardHeader
          icon={DatabaseIcon}
          title={'Storage'}
          subtitle={'Configure where your data will be stored'}
        ></CollapsibleCardHeader>
        <CollapsibleCardContent>
          {dataMart?.storage && (
            <DataMartDataStorageView
              dataStorage={dataMart.storage}
              onDataStorageChange={updateDataMartStorage}
            ></DataMartDataStorageView>
          )}
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard collapsible name={'input-source'}>
        <CollapsibleCardHeader
          icon={CodeIcon}
          title={'Input Source'}
          subtitle={'Configure how to extract data from your data warehouse'}
        ></CollapsibleCardHeader>
        <CollapsibleCardContent>
          {dataMart && <DataMartDefinitionSettings />}
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard collapsible name={'output-schema'}>
        <CollapsibleCardHeader
          icon={Columns3}
          title={'Output Schema'}
          subtitle={'Configure your data mart output schema'}
        ></CollapsibleCardHeader>
        <CollapsibleCardContent>{dataMart && <DataMartSchemaSettings />}</CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>
    </div>
  );
}
