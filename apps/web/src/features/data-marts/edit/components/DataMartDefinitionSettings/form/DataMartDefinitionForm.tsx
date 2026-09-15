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
  connectorName?: string | null;
  initialDefinitionType?: DataMartDefinitionType | null;
  saveDataMartDefinition?: (e?: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function DataMartDefinitionForm({
  definitionType,
  storageType,
  storageId,
  storageConfig,
  preset,
  connectorName,
  initialDefinitionType,
  saveDataMartDefinition,
}: DataMartDefinitionFormProps) {
  const { control } = useFormContext<DataMartDefinitionFormData>();
  const [shouldAutoOpenConnector, setShouldAutoOpenConnector] = useState(false);
  const [shouldAutoOpenTable, setShouldAutoOpenTable] = useState(false);
  const [shouldAutoOpenView, setShouldAutoOpenView] = useState(false);
  const [shouldAutoOpenTablePattern, setShouldAutoOpenTablePattern] = useState(false);

  useEffect(() => {
    const isDifferentFromInitial = initialDefinitionType !== definitionType;

    setShouldAutoOpenTable(
      definitionType === DataMartDefinitionType.TABLE && isDifferentFromInitial
    );

    setShouldAutoOpenView(definitionType === DataMartDefinitionType.VIEW && isDifferentFromInitial);

    setShouldAutoOpenTablePattern(
      definitionType === DataMartDefinitionType.TABLE_PATTERN && isDifferentFromInitial
    );

    // connectorName and preset each drive their own preselect-and-open effect
    // further down in DataMartConnectorView, so the generic auto-open here
    // must stay off for both to avoid competing with that preselected open.
    setShouldAutoOpenConnector(
      definitionType === DataMartDefinitionType.CONNECTOR && !preset && !connectorName
    );
  }, [definitionType, initialDefinitionType, preset, connectorName]);

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
          autoOpen={shouldAutoOpenTable}
        />
      )}

      {definitionType === DataMartDefinitionType.VIEW && (
        <DefinitionFqnField
          control={control}
          storageType={storageType}
          storageId={storageId}
          storageConfig={storageConfig}
          mode='VIEW'
          autoOpen={shouldAutoOpenView}
        />
      )}

      {definitionType === DataMartDefinitionType.TABLE_PATTERN && (
        <TablePatternDefinitionField
          control={control}
          storageType={storageType}
          storageId={storageId}
          storageConfig={storageConfig}
          autoOpen={shouldAutoOpenTablePattern}
        />
      )}

      {definitionType === DataMartDefinitionType.CONNECTOR && (
        <ConnectorDefinitionField
          control={control}
          storageType={storageType}
          preset={preset}
          connectorName={connectorName}
          autoOpen={shouldAutoOpenConnector}
          saveDataMartDefinition={saveDataMartDefinition}
        />
      )}
    </div>
  );
}
