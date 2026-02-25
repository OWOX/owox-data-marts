type FilterDataType = 'string' | 'number' | 'boolean' | 'date' | 'enum';

type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains';

type FilterKey = string;

interface FilterConfigItem<K extends FilterKey = string> {
  id: K;
  label: string;
  dataType: FilterDataType;
  operators: FilterOperator[];

  options?: { value: string; label: string }[];
  loadOptions?: () => Promise<{ value: string; label: string }[]>;
}

interface AppliedFilter<K extends FilterKey = string> {
  fieldId: K;
  operator: FilterOperator;
  value: string[];
}

interface FiltersState<K extends FilterKey = string> {
  version: 1;
  filters: AppliedFilter<K>[];
}

const DEFAULT_FILTERS_STATE: FiltersState = {
  version: 1,
  filters: [],
};

export type { FilterDataType, FilterOperator, FilterConfigItem, AppliedFilter, FiltersState };

export { DEFAULT_FILTERS_STATE };
