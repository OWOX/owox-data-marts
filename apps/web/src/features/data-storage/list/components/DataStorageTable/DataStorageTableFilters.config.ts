import type { FilterConfigItem } from '../../../../../shared/components/TableFilters/types';
import type { FilterAccessors } from '../../../../../shared/components/TableFilters/filter-utils';
import {
  collectOptionsFromData,
  type SelectOption,
} from '../../../../../shared/components/TableFilters/collectOptions.utils';
import type { DataStorageTableItem } from './columns/columns';
import { DataStorageTypeModel } from '../../../shared/types/data-storage-type.model';

/* ---------------------------------------------------------------------------
 * Filter keys
 * ------------------------------------------------------------------------ */

export type DataStorageFilterKey = 'title' | 'type';

/* ---------------------------------------------------------------------------
 * Accessors (used both for filtering and option collection)
 * ------------------------------------------------------------------------ */

export const dataStorageFilterAccessors: FilterAccessors<
  DataStorageFilterKey,
  DataStorageTableItem
> = {
  title: row => row.title,
  type: row => row.type,
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
    dataStorageFilterAccessors.title
  );

  /* -----------------------------
   * Storage type options
   * --------------------------- */
  const typeOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataStorageFilterAccessors.type,
    {
      labelMapper: value => {
        const info = DataStorageTypeModel.getInfo(value as never);
        return info.displayName;
      },
    }
  );

  return [
    {
      id: 'title',
      label: 'Storage title',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: storageTitleOptions,
    },
    {
      id: 'type',
      label: 'Storage type',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: typeOptions,
    },
  ];
}
