import type {
  FilterAccessors,
  FilterConfigItem,
} from '../../../../../shared/components/TableFilters';
import {
  collectOptionsFromData,
  type SelectOption,
} from '../../../../../shared/components/TableFilters/collectOptions.utils';
import { DataStorageTypeModel } from '../../../shared/types/data-storage-type.model';
import type { DataStorageTableItem } from './columns';
import { DataStorageColumnKey, dataStorageColumnLabels } from './columns';

/* ---------------------------------------------------------------------------
 * Filter keys
 * ------------------------------------------------------------------------ */

export type DataStorageFilterKey =
  | DataStorageColumnKey.TITLE
  | DataStorageColumnKey.TYPE
  | DataStorageColumnKey.CREATED_BY
  | DataStorageColumnKey.OWNERS
  | DataStorageColumnKey.CONTEXTS;

/* ---------------------------------------------------------------------------
 * Accessors (used both for filtering and option collection)
 * ------------------------------------------------------------------------ */

export const dataStorageFilterAccessors: FilterAccessors<
  DataStorageFilterKey,
  DataStorageTableItem
> = {
  [DataStorageColumnKey.TITLE]: row => row.title,
  [DataStorageColumnKey.TYPE]: row => row.type,
  [DataStorageColumnKey.CREATED_BY]: row => row.createdByUser?.userId,
  [DataStorageColumnKey.OWNERS]: row => (row.ownerUsers ?? []).map(u => u.userId),
  [DataStorageColumnKey.CONTEXTS]: row => row.contexts.map(c => c.id),
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

  /* -----------------------------
   * User label mapper (shared by Created By and Owners)
   * --------------------------- */
  const userLabelMap = new Map<string, string>();
  for (const item of data) {
    if (item.createdByUser) {
      const u = item.createdByUser;
      userLabelMap.set(u.userId, u.fullName ?? u.email ?? u.userId);
    }
    for (const u of item.ownerUsers ?? []) {
      userLabelMap.set(u.userId, u.fullName ?? u.email ?? u.userId);
    }
  }
  const userLabelMapper = (userId: string) => userLabelMap.get(userId) ?? userId;

  /* -----------------------------
   * Context label mapper (ctxId → name)
   * --------------------------- */
  const contextLabelMap = new Map<string, string>();
  for (const item of data) {
    for (const c of item.contexts) {
      contextLabelMap.set(c.id, c.name);
    }
  }
  const contextLabelMapper = (ctxId: string) => contextLabelMap.get(ctxId) ?? ctxId;

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
    {
      id: DataStorageColumnKey.CREATED_BY,
      label: dataStorageColumnLabels[DataStorageColumnKey.CREATED_BY],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(
        data,
        dataStorageFilterAccessors[DataStorageColumnKey.CREATED_BY],
        { labelMapper: userLabelMapper }
      ),
    },
    {
      id: DataStorageColumnKey.OWNERS,
      label: dataStorageColumnLabels[DataStorageColumnKey.OWNERS],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(
        data,
        dataStorageFilterAccessors[DataStorageColumnKey.OWNERS],
        { labelMapper: userLabelMapper }
      ),
    },
    {
      id: DataStorageColumnKey.CONTEXTS,
      label: dataStorageColumnLabels[DataStorageColumnKey.CONTEXTS],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(
        data,
        dataStorageFilterAccessors[DataStorageColumnKey.CONTEXTS],
        { labelMapper: contextLabelMapper }
      ),
    },
  ];
}
