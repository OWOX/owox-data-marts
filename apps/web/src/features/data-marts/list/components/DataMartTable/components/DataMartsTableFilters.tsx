import {
  TableFilters,
  TableFiltersTrigger,
  TableFiltersContent,
} from '../../../../../../shared/components/TableFilters';
import type { FiltersState } from '../../../../../../shared/components/TableFilters/types';
import type { FilterConfigItem } from '../../../../../../shared/components/TableFilters/types';
import type { DataMartFilterKey } from './DataMartsTableFilters.config';

interface DataMartsTableFiltersProps {
  appliedState: FiltersState<DataMartFilterKey>;
  config: FilterConfigItem<DataMartFilterKey>[];
  onApply: (state: FiltersState<DataMartFilterKey>) => void;
  onClear: () => void;
}

export function DataMartsTableFilters({
  appliedState,
  config,
  onApply,
  onClear,
}: DataMartsTableFiltersProps) {
  return (
    <TableFilters appliedState={appliedState} onApply={onApply} onClear={onClear}>
      <TableFiltersTrigger />
      <TableFiltersContent config={config} />
    </TableFilters>
  );
}
