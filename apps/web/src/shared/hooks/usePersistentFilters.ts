import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, type SetURLSearchParams } from 'react-router-dom';
import { storageService } from '../../services/localstorage.service';
import {
  DEFAULT_FILTERS_STATE,
  type AppliedFilter,
  type FilterConfigItem,
  type FiltersState,
} from '../components/TableFilters/types';

/* ---------------------------------------------------------------------------
 * Options / Return types
 * ------------------------------------------------------------------------ */

interface UsePersistentFiltersOptions<K extends string> {
  projectId: string;
  tableId: string;
  urlParam?: string;
  config: FilterConfigItem<K>[];
}

interface UsePersistentFiltersReturn<K extends string> {
  appliedState: FiltersState<K>;
  apply: (state: FiltersState<K>) => void;
  clear: () => void;
}

/* ---------------------------------------------------------------------------
 * Project-config storage shape
 * ------------------------------------------------------------------------ */

const STORAGE_KEY = 'user-projects-config';

interface TableConfig {
  filters?: unknown;
}

interface ProjectConfig {
  tables: Record<string, TableConfig | undefined>;
}

type AllProjectsConfig = Record<string, ProjectConfig | undefined>;

/* ---------------------------------------------------------------------------
 * Project-scoped storage helpers
 * ------------------------------------------------------------------------ */

function readAllConfig(): AllProjectsConfig {
  const raw = storageService.get(STORAGE_KEY, 'json');
  if (!raw || typeof raw !== 'object') return {};
  return raw as AllProjectsConfig;
}

function readTableFilters<K extends string>(
  projectId: string,
  tableId: string,
  config: FilterConfigItem<K>[]
): FiltersState<K> | null {
  const all = readAllConfig();
  const raw = all[projectId]?.tables[tableId]?.filters;
  if (!raw) return null;
  return validateFiltersState<K>(raw, config);
}

function writeTableFilters<K extends string>(
  projectId: string,
  tableId: string,
  state: FiltersState<K>
): void {
  const all = readAllConfig();
  const project = all[projectId] ?? { tables: {} };
  const table = project.tables[tableId] ?? {};
  storageService.set(STORAGE_KEY, {
    ...all,
    [projectId]: {
      ...project,
      tables: {
        ...project.tables,
        [tableId]: { ...table, filters: state as unknown },
      },
    },
  });
}

function clearTableFilters(projectId: string, tableId: string): void {
  const all = readAllConfig();
  const project = all[projectId];
  if (!project) return;
  const table = project.tables[tableId];
  if (!table) return;
  const { filters: _filters, ...tableWithoutFilters } = table;
  void _filters;
  storageService.set(STORAGE_KEY, {
    ...all,
    [projectId]: {
      ...project,
      tables: {
        ...project.tables,
        [tableId]: tableWithoutFilters,
      },
    },
  });
}

/* ---------------------------------------------------------------------------
 * URL helpers
 * ------------------------------------------------------------------------ */

// NOTE:
// We intentionally do NOT use shared useUrlParam here.
// Filters URL param is domain-specific and requires
// serialization, normalization and storage sync.

interface UrlFilter {
  f: string;
  o: string;
  v: string[];
}

function encodeFiltersForUrl<K extends string>(filters: AppliedFilter<K>[]): UrlFilter[] {
  return filters.map(f => ({ f: f.fieldId, o: f.operator, v: f.value }));
}

function decodeFiltersFromUrl<K extends string>(raw: unknown[]): AppliedFilter<K>[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): AppliedFilter<K> | null => {
      if (!isRecord(item)) return null;
      if (!('f' in item) || !('o' in item) || !('v' in item)) return null;
      if (!Array.isArray(item.v)) return null;

      return {
        fieldId: item.f as K,
        operator: item.o as AppliedFilter['operator'],
        value: (item.v as unknown[]).filter((x): x is string => typeof x === 'string'),
      };
    })
    .filter((x): x is AppliedFilter<K> => x !== null);
}

function readFromUrl<K extends string>(
  searchParams: URLSearchParams,
  urlParam: string,
  config: FilterConfigItem<K>[]
): FiltersState<K> | null {
  const raw = searchParams.get(urlParam);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const decoded = decodeFiltersFromUrl<K>(parsed);
    const filters = normalizeFilters<K>(decoded, config);
    if (filters.length === 0) return null;

    return { version: 1, filters };
  } catch {
    return null;
  }
}

function writeToUrl<K extends string>(
  setSearchParams: SetURLSearchParams,
  urlParam: string,
  state: FiltersState<K>
): void {
  if (state.filters.length > 0) {
    const serialized = JSON.stringify(encodeFiltersForUrl<K>(state.filters));
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set(urlParam, serialized);
        return next;
      },
      { replace: true }
    );
  } else {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete(urlParam);
        return next;
      },
      { replace: true }
    );
  }
}

/* ---------------------------------------------------------------------------
 * Normalization helpers
 * ------------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// IMPORTANT:
// enum filter values must NOT depend on current data/options.
// Options are UI-only; persistence keeps user intent.
function validateValue<K extends string>(
  value: unknown,
  configItem: FilterConfigItem<K>
): string[] | undefined {
  switch (configItem.dataType) {
    case 'enum': {
      if (Array.isArray(value)) {
        const cleaned = value.filter(v => typeof v === 'string');
        return cleaned.length > 0 ? cleaned : undefined;
      }
      if (typeof value === 'string') return [value];
      return undefined;
    }
    case 'string': {
      if (Array.isArray(value)) {
        const cleaned = value.filter((v): v is string => typeof v === 'string' && v !== '');
        return cleaned.length > 0 ? cleaned : undefined;
      }
      if (typeof value === 'string' && value !== '') return [value];
      return undefined;
    }
    default:
      return undefined;
  }
}

function normalizeFilterEntry<K extends string>(
  raw: unknown,
  config: FilterConfigItem<K>[]
): AppliedFilter<K> | null {
  if (!isRecord(raw)) return null;

  const { fieldId, operator, value } = raw;
  if (typeof fieldId !== 'string' || typeof operator !== 'string') return null;

  const configItem = config.find(c => c.id === fieldId);
  if (!configItem) return null;

  if (!configItem.operators.includes(operator as AppliedFilter['operator'])) {
    return null;
  }

  const validatedValue = validateValue(value, configItem);
  if (validatedValue === undefined) return null;

  return {
    fieldId: fieldId as K,
    operator: operator as AppliedFilter['operator'],
    value: validatedValue,
  };
}

function normalizeFilters<K extends string>(
  raw: unknown[],
  config: FilterConfigItem<K>[]
): AppliedFilter<K>[] {
  const result: AppliedFilter<K>[] = [];
  for (const entry of raw) {
    const normalized = normalizeFilterEntry<K>(entry, config);
    if (normalized) result.push(normalized);
  }
  return result;
}

function validateFiltersState<K extends string>(
  raw: unknown,
  config: FilterConfigItem<K>[]
): FiltersState<K> | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== 1) return null;
  if (!Array.isArray(raw.filters)) return null;

  const filters = normalizeFilters<K>(raw.filters, config);
  return { version: 1, filters };
}

/* ---------------------------------------------------------------------------
 * Hook
 * ------------------------------------------------------------------------ */

export function usePersistentFilters<K extends string>({
  projectId,
  tableId,
  urlParam,
  config,
}: UsePersistentFiltersOptions<K>): UsePersistentFiltersReturn<K> {
  const [searchParams, setSearchParams] = useSearchParams();
  const configRef = useRef(config);
  configRef.current = config;

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const [appliedState, setAppliedState] = useState<FiltersState<K>>(() => {
    const cfg = configRef.current;
    const sp = searchParamsRef.current;

    if (urlParam) {
      const fromUrl = readFromUrl(sp, urlParam, cfg);
      if (fromUrl) {
        writeTableFilters(projectId, tableId, fromUrl);
        return fromUrl;
      }
    }

    const fromStorage = readTableFilters(projectId, tableId, cfg);
    if (fromStorage) return fromStorage;

    return DEFAULT_FILTERS_STATE as FiltersState<K>;
  });

  // Apply filters from storage if they are valid for the current config
  useEffect(() => {
    const cfg = configRef.current;

    const fromStorage = readTableFilters(projectId, tableId, cfg);
    if (!fromStorage) return;

    // If appliedState is empty but there are filters in storage,
    // and they are valid for the new config — apply them
    if (appliedState.filters.length === 0 && fromStorage.filters.length > 0) {
      setAppliedState(fromStorage);

      if (urlParam) {
        writeToUrl(setSearchParams, urlParam, fromStorage);
      }
    }
  }, [config, projectId, tableId, urlParam, setSearchParams, appliedState]);

  // Sync URL when active filters exist but URL param is missing (e.g. after navigation)
  useEffect(() => {
    if (!urlParam) return;
    const hasUrlParam = searchParams.has(urlParam);
    const hasActiveFilters = appliedState.filters.length > 0;
    if (!hasUrlParam && hasActiveFilters) {
      writeToUrl(setSearchParams, urlParam, appliedState);
    }
  }, [appliedState, urlParam, searchParams, setSearchParams]);

  const apply = useCallback(
    (state: FiltersState<K>) => {
      const cfg = configRef.current;
      const normalized: FiltersState<K> = {
        version: 1,
        filters: normalizeFilters<K>(state.filters as unknown[], cfg),
      };

      setAppliedState(normalized);
      writeTableFilters(projectId, tableId, normalized);

      if (urlParam) {
        writeToUrl(setSearchParams, urlParam, normalized);
      }
    },
    [projectId, tableId, urlParam, setSearchParams]
  );

  const clear = useCallback(() => {
    setAppliedState(DEFAULT_FILTERS_STATE as FiltersState<K>);
    clearTableFilters(projectId, tableId);

    if (urlParam) {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.delete(urlParam);
          return next;
        },
        { replace: true }
      );
    }
  }, [projectId, tableId, urlParam, setSearchParams]);

  return { appliedState, apply, clear };
}
