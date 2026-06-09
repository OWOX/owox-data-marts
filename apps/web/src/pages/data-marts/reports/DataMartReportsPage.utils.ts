import type { DataMartReport } from '../../../features/data-marts/reports/shared/model/types/data-mart-report';

function areReportSnapshotsEqual(left: DataMartReport, right: DataMartReport) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeReportPagePreservingRows(
  currentReports: DataMartReport[],
  nextReports: DataMartReport[]
) {
  const currentReportsById = new Map(currentReports.map(report => [report.id, report]));
  const nextReportIds = new Set(nextReports.map(report => report.id));
  const refreshedReports = nextReports.map(nextReport => {
    const currentReport = currentReportsById.get(nextReport.id);
    return currentReport && areReportSnapshotsEqual(currentReport, nextReport)
      ? currentReport
      : nextReport;
  });
  const loadedOlderReports = currentReports.filter(report => !nextReportIds.has(report.id));
  const mergedReports = [...refreshedReports, ...loadedOlderReports];
  const hasChanges =
    mergedReports.length !== currentReports.length ||
    mergedReports.some((report, index) => report !== currentReports[index]);

  return hasChanges ? mergedReports : currentReports;
}
