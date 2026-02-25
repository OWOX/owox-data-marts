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

/* ---------------------------------------------------------------------------
 * Filter keys
 * ------------------------------------------------------------------------ */

export type DataMartFilterKey =
  | 'status'
  | 'storageType'
  | 'storageTitle'
  | 'title'
  | 'definitionType'
  | 'inputSource';

/* ---------------------------------------------------------------------------
 * Accessors (used both for filtering and option collection)
 * ------------------------------------------------------------------------ */

export const dataMartsFilterAccessors: FilterAccessors<DataMartFilterKey, DataMartListItem> = {
  status: row => row.status.code,
  storageType: row => row.storageType,
  storageTitle: row => row.storageTitle,
  title: row => row.title,
  definitionType: row => row.definitionType,
  inputSource: row => {
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
    dataMartsFilterAccessors.status,
    {
      labelMapper: value => {
        switch (value) {
          case 'DRAFT':
            return 'Draft';
          case 'PUBLISHED':
            return 'Published';
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
    dataMartsFilterAccessors.storageType,
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
    dataMartsFilterAccessors.storageTitle
  );

  /* -----------------------------
   * Title options
   * --------------------------- */
  const titleOptions: SelectOption[] = collectOptionsFromData(data, dataMartsFilterAccessors.title);

  /* -----------------------------
   * Definition type options
   * --------------------------- */
  const definitionTypeOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataMartsFilterAccessors.definitionType,
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
    dataMartsFilterAccessors.inputSource
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
      id: 'title',
      label: 'Title',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: titleOptions,
    },
    {
      id: 'inputSource',
      label: 'Input source',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: inputSourceOptions,
    },
    {
      id: 'definitionType',
      label: 'Definition',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: definitionTypeOptions,
    },
    {
      id: 'storageType',
      label: 'Storage type',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: storageTypeOptions,
    },
    {
      id: 'storageTitle',
      label: 'Storage title',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: storageTitleOptions,
    },
    {
      id: 'status',
      label: 'Status',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: statusOptions,
    },
  ];
}
