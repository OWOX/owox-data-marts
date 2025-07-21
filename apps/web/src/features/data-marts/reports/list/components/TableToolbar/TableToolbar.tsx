import { Search, Plus } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { Table } from '@tanstack/react-table';
import { DataMartStatus } from '../../../../shared';
import type { DataMartStatusInfo } from '../../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';

interface TableToolbarProps {
  table: Table<DataMartReport>;
  searchInputId: string;
  columnsMenuId: string;
  columnsMenuOpen: boolean;
  setColumnsMenuOpen: (open: boolean) => void;
  onAddReport: () => void;
  filterValue: string;
  onFilterChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  dataMartStatus?: DataMartStatusInfo;
}

/**
 * Table toolbar component containing search, column visibility menu, and add button
 */
export function TableToolbar({
  searchInputId,
  onAddReport,
  filterValue,
  onFilterChange,
  dataMartStatus,
}: TableToolbarProps) {
  return (
    <div className='dm-card-toolbar'>
      {/* LEFT Column */}
      <div className='dm-card-toolbar-left'>
        {/* Search */}
        <div className='dm-card-toolbar-search'>
          <Search className='dm-card-toolbar-search-icon' aria-hidden='true' />
          <Input
            id={searchInputId}
            placeholder='Search by report title'
            value={filterValue}
            onChange={onFilterChange}
            className='dm-card-toolbar-search-input'
            aria-label='Search reports by title'
          />
        </div>
      </div>

      {/* RIGHT Column */}
      <div className='dm-card-toolbar-right'>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant='outline'
                className='dm-card-toolbar-btn-primary'
                onClick={onAddReport}
                aria-label='Add new Google Sheets report'
                disabled={dataMartStatus?.code === DataMartStatus.DRAFT}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                Add report
              </Button>
            </span>
          </TooltipTrigger>
          {dataMartStatus?.code === DataMartStatus.DRAFT && (
            <TooltipContent>
              <p>To create a report, publish the Data Mart first</p>
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
}
