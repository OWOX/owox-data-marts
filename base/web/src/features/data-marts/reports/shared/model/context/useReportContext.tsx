import { useContext } from 'react';
import { ReportsContext } from './context';

export function useReportContext() {
  const context = useContext(ReportsContext);
  if (context === undefined) {
    throw new Error('useReportContext must be used within a ReportProvider');
  }
  return context;
}
