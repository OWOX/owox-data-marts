import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { DataMartDefinitionType } from '../../../../shared';
import { DataStorageType } from '../../../../../data-storage';
import type { DataStorageConfigDto } from '../../../../../data-storage/shared/api/types';
import { SqlDefinitionField } from './SqlDefinitionField.tsx';
import { DefinitionFqnField } from './DefinitionFqnField.tsx';
import { TablePatternDefinitionField } from './TablePatternDefinitionField.tsx';
import { ConnectorDefinitionField } from './ConnectorDefinitionField.tsx';
import type { DataMartDefinitionFormData } from '../../../model/schema/data-mart-definition.schema.ts';

interface DataMartDefinitionFormProps {
  definitionType: DataMartDefinitionType;
  storageType: DataStorageType;
  storageId: string;
  storageConfig: DataStorageConfigDto | null;
  preset?: string;
  saveDataMartDefinition?: (e?: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function DataMartDefinitionForm({
  definitionType,
  storageType,
  storageId,
  storageConfig,
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
        <DefinitionFqnField
          control={control}
          storageType={storageType}
          storageId={storageId}
          storageConfig={storageConfig}
          mode='TABLE'
        />
      )}

      {definitionType === DataMartDefinitionType.VIEW && (
        <DefinitionFqnField
          control={control}
          storageType={storageType}
          storageId={storageId}
          storageConfig={storageConfig}
          mode='VIEW'
        />
      )}

      {definitionType === DataMartDefinitionType.TABLE_PATTERN && (
        <TablePatternDefinitionField
          control={control}
          storageType={storageType}
          storageId={storageId}
          storageConfig={storageConfig}
        />
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
