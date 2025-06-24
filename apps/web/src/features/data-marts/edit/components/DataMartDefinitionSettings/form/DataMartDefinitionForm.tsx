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
}

export function DataMartDefinitionForm({
  definitionType,
  storageType,
}: DataMartDefinitionFormProps) {
  const { control } = useFormContext<DataMartDefinitionFormData>();

  return (
    <div className='space-y-6'>
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
        <ConnectorDefinitionField control={control} storageType={storageType} />
      )}
    </div>
  );
}
