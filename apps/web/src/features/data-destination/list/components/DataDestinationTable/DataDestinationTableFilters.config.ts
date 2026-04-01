import type {
  FilterAccessors,
  FilterConfigItem,
} from '../../../../../shared/components/TableFilters';
import {
  collectOptionsFromData,
  type SelectOption,
} from '../../../../../shared/components/TableFilters/collectOptions.utils';
import { DataDestinationTypeModel } from '../../../shared';
import type { DataDestinationTableItem } from './columns';
import { DataDestinationColumnKey, dataDestinationColumnLabels } from './columns';

/* ---------------------------------------------------------------------------
 * Filter keys
 * ------------------------------------------------------------------------ */

export type DataDestinationFilterKey =
  | DataDestinationColumnKey.TITLE
  | DataDestinationColumnKey.TYPE
  | DataDestinationColumnKey.CREATED_BY
  | DataDestinationColumnKey.OWNERS;

/* ---------------------------------------------------------------------------
 * Accessors (used both for filtering and option collection)
 * ------------------------------------------------------------------------ */

export const dataDestinationFilterAccessors: FilterAccessors<
  DataDestinationFilterKey,
  DataDestinationTableItem
> = {
  [DataDestinationColumnKey.TITLE]: row => row.title,
  [DataDestinationColumnKey.TYPE]: row => row.type,
  [DataDestinationColumnKey.CREATED_BY]: row => row.createdByUser?.userId,
  [DataDestinationColumnKey.OWNERS]: row => (row.ownerUsers ?? []).map(u => u.userId),
};

/* ---------------------------------------------------------------------------
 * Builder
 * ------------------------------------------------------------------------ */

export function buildDataDestinationTableFilters(
  data: DataDestinationTableItem[]
): FilterConfigItem<DataDestinationFilterKey>[] {
  /* -----------------------------
   * Destination title options
   * --------------------------- */
  const titleOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataDestinationFilterAccessors[DataDestinationColumnKey.TITLE]
  );

  /* -----------------------------
   * Destination type options
   * --------------------------- */
  const typeOptions: SelectOption[] = collectOptionsFromData(
    data,
    dataDestinationFilterAccessors[DataDestinationColumnKey.TYPE],
    {
      labelMapper: value => {
        const info = DataDestinationTypeModel.getInfo(value as never);
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

  return [
    {
      id: DataDestinationColumnKey.TITLE,
      label: dataDestinationColumnLabels[DataDestinationColumnKey.TITLE],
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: titleOptions,
    },
    {
      id: DataDestinationColumnKey.TYPE,
      label: dataDestinationColumnLabels[DataDestinationColumnKey.TYPE],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: typeOptions,
    },
    {
      id: DataDestinationColumnKey.CREATED_BY,
      label: dataDestinationColumnLabels[DataDestinationColumnKey.CREATED_BY],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(
        data,
        dataDestinationFilterAccessors[DataDestinationColumnKey.CREATED_BY],
        { labelMapper: userLabelMapper }
      ),
    },
    {
      id: DataDestinationColumnKey.OWNERS,
      label: dataDestinationColumnLabels[DataDestinationColumnKey.OWNERS],
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(
        data,
        dataDestinationFilterAccessors[DataDestinationColumnKey.OWNERS],
        { labelMapper: userLabelMapper }
      ),
    },
  ];
}
