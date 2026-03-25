import type { FilterConfigItem } from '../../../../../shared/components/TableFilters';
import {
  TableFilters,
  TableFiltersContent,
  TableFiltersTrigger,
} from '../../../../../shared/components/TableFilters';
import type { FiltersState } from '../../../../../shared/components/TableFilters/types';
import type { DataDestinationFilterKey } from './DataDestinationTableFilters.config';

interface DataDestinationTableFiltersProps {
  appliedState: FiltersState<DataDestinationFilterKey>;
  config: FilterConfigItem<DataDestinationFilterKey>[];
  onApply: (state: FiltersState<DataDestinationFilterKey>) => void;
  onClear: () => void;
}

export function DataDestinationTableFilters({
  appliedState,
  config,
  onApply,
  onClear,
}: DataDestinationTableFiltersProps) {
  return (
    <TableFilters appliedState={appliedState} onApply={onApply} onClear={onClear}>
      <TableFiltersTrigger />
      <TableFiltersContent config={config} />
    </TableFilters>
  );
}
