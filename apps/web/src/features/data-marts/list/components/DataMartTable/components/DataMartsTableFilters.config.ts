import type { FilterConfigItem } from '../../../../../../shared/components/TableFilters/types';
import type { FilterAccessors } from '../../../../../../shared/components/TableFilters/filter-utils';
import {
  collectOptionsFromData,
  type SelectOption,
} from '../../../../../../shared/components/TableFilters/collectOptions.utils';
import type { DataMartListItem } from '../../../model/types';
import { DataStorageTypeModel } from '../../../../../data-storage/shared/types/data-storage-type.model';
import { DataMartDefinitionTypeModel } from '../../../../shared/types/data-mart-definition-type.model';
import { DataMartDefinitionType } from '../../../../shared/enums/data-mart-definition-type.enum';
import type { ConnectorListItem } from '../../../../../connectors/shared/model/types/connector';
import { DataMartColumnKey } from '../columns/columnKeys';
import { DataMartStatus } from '../../../../shared/enums/data-mart-status.enum';
import { DataMartStatusModel } from '../../../../shared/types/data-mart-status.model';
import { dataMartColumnLabels } from '../columns/columnLabels';

/* ---------------------------------------------------------------------------
 * Filter keys
 * ------------------------------------------------------------------------ */
enum AdditionalFilterKeys {
  STORAGE_TITLE = 'storageTitle',
  INPUT_SOURCE = 'inputSource',
}

export type DataMartFilterKey =
  | DataMartColumnKey.STATUS
  | DataMartColumnKey.STORAGE_TYPE
  | AdditionalFilterKeys.STORAGE_TITLE
  | DataMartColumnKey.TITLE
  | DataMartColumnKey.DEFINITION_TYPE
  | AdditionalFilterKeys.INPUT_SOURCE;

/* ---------------------------------------------------------------------------
 * Accessors (used both for filtering and option collection)
 * ------------------------------------------------------------------------ */

export const dataMartsFilterAccessors: FilterAccessors<DataMartFilterKey, DataMartListItem> = {
  [DataMartColumnKey.STATUS]: row => row.status.code,
  [DataMartColumnKey.STORAGE_TYPE]: row => row.storageType,
  [AdditionalFilterKeys.STORAGE_TITLE]: row => row.storageTitle,
  [DataMartColumnKey.TITLE]: row => row.title,
  [DataMartColumnKey.DEFINITION_TYPE]: row => row.definitionType,
  [AdditionalFilterKeys.INPUT_SOURCE]: row => {
    if (row.definitionType === DataMartDefinitionType.CONNECTOR) {
      return row.connectorSourceName;
    }
    return 'OTHER';
  },
};

/* ---------------------------------------------------------------------------
 * Builder
 * ------------------------------------------------------------------------ */

export function buildDataMartsTableFilters(
  data: DataMartListItem[],
  connectors: ConnectorListItem[] = []
): FilterConfigItem<DataMartFilterKey>[] {
  /* -----------------------------
   * Status options
   * --------------------------- */
  const statusOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataMartsFilterAccessors[DataMartColumnKey.STATUS],
    {
      labelMapper: value => {
        switch (value as DataMartStatus) {
          case DataMartStatus.DRAFT:
            return DataMartStatusModel.getInfo(DataMartStatus.DRAFT).displayName;
          case DataMartStatus.PUBLISHED:
            return DataMartStatusModel.getInfo(DataMartStatus.PUBLISHED).displayName;
          default:
            return value;
        }
      },
    }
  );

  /* -----------------------------
   * Storage type options
   * --------------------------- */
  const storageTypeOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataMartsFilterAccessors[DataMartColumnKey.STORAGE_TYPE],
    {
      labelMapper: value => {
        const info = DataStorageTypeModel.getInfo(value as never);
        return info.displayName;
      },
    }
  );

  /* -----------------------------
   * Storage title options
   * --------------------------- */
  const storageTitleOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataMartsFilterAccessors[AdditionalFilterKeys.STORAGE_TITLE]
  );

  /* -----------------------------
   * Title options
   * --------------------------- */
  const titleOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataMartsFilterAccessors[DataMartColumnKey.TITLE]
  );

  /* -----------------------------
   * Definition type options
   * --------------------------- */
  const definitionTypeOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataMartsFilterAccessors[DataMartColumnKey.DEFINITION_TYPE],
    {
      labelMapper: value => {
        const info = DataMartDefinitionTypeModel.getInfo(value as never);
        return info.displayName;
      },
    }
  );

  /* -----------------------------
   * Input source options
   * --------------------------- */
  const inputSourceOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataMartsFilterAccessors[AdditionalFilterKeys.INPUT_SOURCE]
  ).map(option => {
    if (option.value === 'OTHER') {
      return {
        value: 'OTHER',
        label: 'Other (not connector)',
      };
    }

    const connector = connectors.find(c => c.name === option.value);

    return {
      value: option.value,
      label: connector?.displayName ?? option.value,
    };
  });

  return [
    {
      id: DataMartColumnKey.TITLE,
      label: dataMartColumnLabels[DataMartColumnKey.TITLE],
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: titleOptions,
    },
    {
      id: AdditionalFilterKeys.INPUT_SOURCE,
      label: dataMartColumnLabels[DataMartColumnKey.DEFINITION_TYPE],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: inputSourceOptions,
    },
    {
      id: DataMartColumnKey.DEFINITION_TYPE,
      label: 'Definition',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: definitionTypeOptions,
    },
    {
      id: DataMartColumnKey.STORAGE_TYPE,
      label: 'Storage type',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: storageTypeOptions,
    },
    {
      id: AdditionalFilterKeys.STORAGE_TITLE,
      label: 'Storage title',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: storageTitleOptions,
    },
    {
      id: DataMartColumnKey.STATUS,
      label: dataMartColumnLabels[DataMartColumnKey.STATUS],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: statusOptions,
    },
  ];
}
