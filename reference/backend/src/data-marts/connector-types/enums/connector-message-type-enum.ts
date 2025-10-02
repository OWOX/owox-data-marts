export enum ConnectorMessageType {
  LOG = 'log',
  IS_IN_PROGRESS = 'isInProgress',
  STATUS = 'updateCurrentStatus',
  STATE = 'updateLastImportDate',
  REQUESTED_DATE = 'updateLastRequstedDate',
  WARNING = 'addWarningToCurrentStatus',
  UNKNOWN = 'unknown',
  ERROR = 'error',
}
