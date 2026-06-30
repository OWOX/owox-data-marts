export enum ConnectorMessageType {
  LOG = 'log',
  IS_IN_PROGRESS = 'isInProgress',
  STATUS = 'updateCurrentStatus',
  STATE = 'updateLastImportDate',
  CREDENTIALS_UPDATE = 'updateCredentials',
  REQUESTED_DATE = 'updateLastRequstedDate',
  WARNING = 'addWarningToCurrentStatus',
  UNKNOWN = 'unknown',
  ERROR = 'error',
}
