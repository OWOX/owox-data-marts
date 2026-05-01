import { useReport } from '../../../../reports/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useEffect } from 'react';
import { useDataMartContext } from '../../../../edit/model';
import { DataDestinationType, DataDestinationTypeModel } from '../../../../../data-destination';

interface ReportSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const allowedReportTypes = [
  DataDestinationType.GOOGLE_SHEETS,
  DataDestinationType.EMAIL,
  DataDestinationType.SLACK,
  DataDestinationType.MS_TEAMS,
  DataDestinationType.GOOGLE_CHAT,
];

export function ReportSelector({ value, onChange, disabled }: ReportSelectorProps) {
  const { reports, fetchReportsByDataMartId } = useReport();
  const { dataMart } = useDataMartContext();

  useEffect(() => {
    if (!dataMart) return;
    void fetchReportsByDataMartId(dataMart.id);
  }, [fetchReportsByDataMartId, dataMart]);

  const filteredReports = reports.filter(report =>
    allowedReportTypes.includes(report.dataDestination.type)
  );

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className='w-full text-left'>
        <SelectValue placeholder='Select a report' />
      </SelectTrigger>
      <SelectContent className='max-w-[var(--radix-select-trigger-width)]'>
        {filteredReports.length === 0 ? (
          <div className='text-muted-foreground flex flex-col gap-1 px-3 py-2 text-sm leading-tight'>
            <div className='font-medium'>No reports yet</div>
            <div className='text-xs'>Create one in the Destination tab</div>
          </div>
        ) : (
          filteredReports.map(report => {
            const Icon = DataDestinationTypeModel.getInfo(report.dataDestination.type).icon;
            return (
              <SelectItem key={report.id} value={report.id} className='min-w-0 overflow-hidden'>
                <div className='flex w-full min-w-0 items-center gap-2 overflow-hidden'>
                  <Icon className='h-4 w-4 shrink-0' size={16} />
                  <span className='flex-1 truncate' title={report.title}>
                    {report.title}
                  </span>
                </div>
              </SelectItem>
            );
          })
        )}
      </SelectContent>
    </Select>
  );
}
