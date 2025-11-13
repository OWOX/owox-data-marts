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
      <SelectTrigger className='w-full'>
        <SelectValue placeholder='Select a report' />
      </SelectTrigger>
      <SelectContent>
        {filteredReports.map(report => {
          const Icon = DataDestinationTypeModel.getInfo(report.dataDestination.type).icon;
          return (
            <SelectItem key={report.id} value={report.id}>
              <div className='flex items-center gap-2'>
                <Icon className='h-4 w-4' size={16} />
                <span>{report.title}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
