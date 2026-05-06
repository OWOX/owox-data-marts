import { useCallback } from 'react';
import type { FilterRule, OutputConfig, SortRule } from '../../../shared/types/output-config';

export function useOutputConfig(value: OutputConfig, onChange: (next: OutputConfig) => void) {
  const setFilters = useCallback(
    (filters: FilterRule[]) => {
      onChange({ ...value, filterConfig: filters });
    },
    [value, onChange]
  );

  const upsertFilter = useCallback(
    (rule: FilterRule) => {
      const idx = value.filterConfig.findIndex(f => f.column === rule.column);
      const next = [...value.filterConfig];
      if (idx === -1) next.push(rule);
      else next[idx] = rule;
      setFilters(next);
    },
    [value.filterConfig, setFilters]
  );

  const removeFilter = useCallback(
    (column: string) => {
      setFilters(value.filterConfig.filter(f => f.column !== column));
    },
    [value.filterConfig, setFilters]
  );

  const setSort = useCallback(
    (sort: SortRule[]) => {
      onChange({ ...value, sortConfig: sort });
    },
    [value, onChange]
  );

  const upsertSort = useCallback(
    (rule: SortRule, atIndex?: number) => {
      const filtered = value.sortConfig.filter(r => r.column !== rule.column);
      const next = [...filtered];
      if (atIndex == null) next.push(rule);
      else next.splice(atIndex, 0, rule);
      setSort(next);
    },
    [value.sortConfig, setSort]
  );

  const removeSort = useCallback(
    (column: string) => {
      setSort(value.sortConfig.filter(r => r.column !== column));
    },
    [value.sortConfig, setSort]
  );

  const moveSort = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = [...value.sortConfig];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      setSort(next);
    },
    [value.sortConfig, setSort]
  );

  const setLimit = useCallback(
    (limit: number | null) => {
      onChange({ ...value, limitConfig: limit });
    },
    [value, onChange]
  );

  const findFilter = useCallback(
    (column: string) => value.filterConfig.find(f => f.column === column),
    [value.filterConfig]
  );

  return {
    upsertFilter,
    removeFilter,
    upsertSort,
    removeSort,
    moveSort,
    setLimit,
    findFilter,
  };
}
