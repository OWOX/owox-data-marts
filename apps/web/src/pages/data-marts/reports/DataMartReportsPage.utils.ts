import type { DataMartReport } from '../../../features/data-marts/reports/shared/model/types/data-mart-report';

function areReportSnapshotsEqual(left: DataMartReport, right: DataMartReport) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeReportPagePreservingRows(
  currentReports: DataMartReport[],
  nextReports: DataMartReport[]
) {
  const currentReportsById = new Map(currentReports.map(report => [report.id, report]));
  const nextReportsById = new Map(nextReports.map(report => [report.id, report]));
  const refreshedReports = currentReports.map(currentReport => {
    const nextReport = nextReportsById.get(currentReport.id);
    if (!nextReport) {
      return currentReport;
    }

    return areReportSnapshotsEqual(currentReport, nextReport) ? currentReport : nextReport;
  });
  const appendedReports = nextReports.filter(nextReport => {
    const currentReport = currentReportsById.get(nextReport.id);
    return !currentReport;
  });
  const mergedReports = [...refreshedReports, ...appendedReports];
  const hasChanges =
    mergedReports.length !== currentReports.length ||
    mergedReports.some((report, index) => report !== currentReports[index]);

  return hasChanges ? mergedReports : currentReports;
}
