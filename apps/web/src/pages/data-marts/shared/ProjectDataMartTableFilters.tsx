import {
  TableFilters,
  TableFiltersContent,
  TableFiltersTrigger,
  type FilterConfigItem,
} from '../../../shared/components/TableFilters';
import type { FiltersState } from '../../../shared/components/TableFilters/types';

interface ProjectDataMartTableFiltersProps<K extends string> {
  appliedState: FiltersState<K>;
  config: FilterConfigItem<K>[];
  onApply: (state: FiltersState<K>) => void;
  onClear: () => void;
}

export function ProjectDataMartTableFilters<K extends string>({
  appliedState,
  config,
  onApply,
  onClear,
}: ProjectDataMartTableFiltersProps<K>) {
  return (
    <TableFilters appliedState={appliedState} onApply={onApply} onClear={onClear}>
      <TableFiltersTrigger />
      <TableFiltersContent config={config} />
    </TableFilters>
  );
}
