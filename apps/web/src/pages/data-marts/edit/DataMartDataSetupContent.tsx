import { useState } from 'react';
import {
  DataMartDataStorageView,
  DataMartDefinitionSettings,
  DataMartSchemaSettings,
} from '../../../features/data-marts/edit';
import { useDataMartContext } from '../../../features/data-marts/edit/model';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../shared/components/CollapsibleCard';
import { DatabaseIcon, CodeIcon, Columns3 } from 'lucide-react';
import type { DataMartDefinitionType } from '../../../features/data-marts/shared';

export default function DataMartDataSetupContent() {
  const { dataMart, updateDataMartStorage } = useDataMartContext();
  const initialDefinitionType = dataMart?.definitionType ?? null;
  const [definitionType, setDefinitionType] = useState<DataMartDefinitionType | null>(
    initialDefinitionType
  );

  return (
    <div className={'flex flex-col gap-4'}>
      <CollapsibleCard collapsible name={'data-storage'}>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={DatabaseIcon}
            tooltip='Configure where your data will be stored'
          >
            Storage
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
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
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={CodeIcon}
            tooltip='Configure how to extract data from your data warehouse'
          >
            Input Source
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {dataMart && (
            <DataMartDefinitionSettings
              definitionType={definitionType}
              initialDefinitionType={initialDefinitionType}
              setDefinitionType={setDefinitionType}
            />
          )}
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard collapsible name={'output-schema'}>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Columns3}
            tooltip='Configure your data mart output schema'
          >
            Output Schema
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {dataMart && <DataMartSchemaSettings definitionType={definitionType} />}
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>
    </div>
  );
}
