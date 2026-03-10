import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { InsightReportsList } from './InsightReportsList';
import type { DataMartReport } from '../../reports/shared/model/types/data-mart-report';

interface InsightReportsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataMartId: string;
  insightId: string;
  onEditReport: (report: DataMartReport) => void;
  onCreateReport: () => void;
}

export function InsightReportsSheet({
  isOpen,
  onClose,
  dataMartId,
  insightId,
  onEditReport,
  onCreateReport,
}: InsightReportsSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className='flex flex-col gap-0 sm:max-w-[600px]'>
        <SheetHeader>
          <div className='flex flex-col gap-1.5 pr-8'>
            <SheetTitle>Insight Reports</SheetTitle>
            <SheetDescription>Manage reports associated with this insight</SheetDescription>
          </div>
        </SheetHeader>
        <div className='bg-muted/50 dark:bg-sidebar flex-1 overflow-y-auto p-4'>
          <InsightReportsList
            dataMartId={dataMartId}
            insightId={insightId}
            onEditReport={report => {
              onClose();
              onEditReport(report);
            }}
            onCreateReport={() => {
              onClose();
              onCreateReport();
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
