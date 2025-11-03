import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { DataMartDefinitionType } from '../../../../shared';
import { DataStorageType } from '../../../../../data-storage';
import { SqlDefinitionField } from './SqlDefinitionField.tsx';
import { TableDefinitionField } from './TableDefinitionField.tsx';
import { ViewDefinitionField } from './ViewDefinitionField.tsx';
import { TablePatternDefinitionField } from './TablePatternDefinitionField.tsx';
import { ConnectorDefinitionField } from './ConnectorDefinitionField.tsx';
import type { DataMartDefinitionFormData } from '../../../model/schema/data-mart-definition.schema.ts';

interface DataMartDefinitionFormProps {
  definitionType: DataMartDefinitionType;
  storageType: DataStorageType;
  preset?: string;
  saveDataMartDefinition?: (e?: React.FormEvent<HTMLFormElement>) => void;
}

export function DataMartDefinitionForm({
  definitionType,
  storageType,
  preset,
  saveDataMartDefinition,
}: DataMartDefinitionFormProps) {
  const { control } = useFormContext<DataMartDefinitionFormData>();
  const [shouldAutoOpenConnector, setShouldAutoOpenConnector] = useState(false);

  useEffect(() => {
    if (definitionType === DataMartDefinitionType.CONNECTOR && !preset) {
      setShouldAutoOpenConnector(true);
    } else {
      setShouldAutoOpenConnector(false);
    }
  }, [definitionType, preset]);

  return (
    <div className='space-y-2'>
      {definitionType === DataMartDefinitionType.SQL && <SqlDefinitionField control={control} />}

      {definitionType === DataMartDefinitionType.TABLE && (
        <TableDefinitionField control={control} storageType={storageType} />
      )}

      {definitionType === DataMartDefinitionType.VIEW && (
        <ViewDefinitionField control={control} storageType={storageType} />
      )}

      {definitionType === DataMartDefinitionType.TABLE_PATTERN && (
        <TablePatternDefinitionField control={control} storageType={storageType} />
      )}

      {definitionType === DataMartDefinitionType.CONNECTOR && (
        <ConnectorDefinitionField
          control={control}
          storageType={storageType}
          preset={preset}
          autoOpen={shouldAutoOpenConnector}
          saveDataMartDefinition={saveDataMartDefinition}
        />
      )}
    </div>
  );
}
