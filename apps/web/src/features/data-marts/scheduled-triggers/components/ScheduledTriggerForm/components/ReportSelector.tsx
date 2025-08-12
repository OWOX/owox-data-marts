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

interface ReportSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ReportSelector({ value, onChange, disabled }: ReportSelectorProps) {
  const { reports, fetchReportsByDataMartId } = useReport();
  const { dataMart } = useDataMartContext();

  useEffect(() => {
    if (!dataMart) return;
    void fetchReportsByDataMartId(dataMart.id);
  }, [fetchReportsByDataMartId, dataMart]);

  const googleSheetsReports = reports.filter(
    report => report.dataDestination?.type === 'GOOGLE_SHEETS'
  );

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className='w-full'>
        <SelectValue placeholder='Select a report' />
      </SelectTrigger>
      <SelectContent>
        {googleSheetsReports.map(report => (
          <SelectItem key={report.id} value={report.id}>
            {report.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
