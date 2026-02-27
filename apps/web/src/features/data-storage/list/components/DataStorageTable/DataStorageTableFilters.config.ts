import type { FilterConfigItem } from '../../../../../shared/components/TableFilters/types';
import type { FilterAccessors } from '../../../../../shared/components/TableFilters/filter-utils';
import {
  collectOptionsFromData,
  type SelectOption,
} from '../../../../../shared/components/TableFilters/collectOptions.utils';
import type { DataStorageTableItem } from './columns/columns';
import { DataStorageTypeModel } from '../../../shared/types/data-storage-type.model';
import { DataStorageColumnKey } from './columns/columnKeys';
import { dataStorageColumnLabels } from './columns/columnLabels';

/* ---------------------------------------------------------------------------
 * Filter keys
 * ------------------------------------------------------------------------ */

export type DataStorageFilterKey = DataStorageColumnKey.TITLE | DataStorageColumnKey.TYPE;

/* ---------------------------------------------------------------------------
 * Accessors (used both for filtering and option collection)
 * ------------------------------------------------------------------------ */

export const dataStorageFilterAccessors: FilterAccessors<
  DataStorageFilterKey,
  DataStorageTableItem
> = {
  [DataStorageColumnKey.TITLE]: row => row.title,
  [DataStorageColumnKey.TYPE]: row => row.type,
};

/* ---------------------------------------------------------------------------
 * Builder
 * ------------------------------------------------------------------------ */

export function buildDataStorageTableFilters(
  data: DataStorageTableItem[]
): FilterConfigItem<DataStorageFilterKey>[] {
  /* -----------------------------
   * Storage title options
   * --------------------------- */
  const storageTitleOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataStorageFilterAccessors[DataStorageColumnKey.TITLE]
  );

  /* -----------------------------
   * Storage type options
   * --------------------------- */
  const typeOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataStorageFilterAccessors[DataStorageColumnKey.TYPE],
    {
      labelMapper: value => {
        const info = DataStorageTypeModel.getInfo(value as never);
        return info.displayName;
      },
    }
  );

  return [
    {
      id: DataStorageColumnKey.TITLE,
      label: dataStorageColumnLabels[DataStorageColumnKey.TITLE],
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: storageTitleOptions,
    },
    {
      id: DataStorageColumnKey.TYPE,
      label: dataStorageColumnLabels[DataStorageColumnKey.TYPE],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: typeOptions,
    },
  ];
}
