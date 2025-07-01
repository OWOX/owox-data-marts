import type { ReportStatusEnum } from '../../enums';
import type { DataDestination } from '../../../../../data-destination';
import type { DataMart } from '../../../../edit';

export interface DataMartReport {
  id: string;
  title: string;
  dataMart: Pick<DataMart, 'id'>;
  dataDestination: DataDestination;
  destinationConfig: {
    type: string;
    spreadsheetId: string;
    sheetId: string;
  };
  lastRunDate: Date | null;
  lastRunStatus: ReportStatusEnum | null;
  lastRunError: string | null;
  runsCount: number;
  createdAt: Date;
  modifiedAt: Date;
}
