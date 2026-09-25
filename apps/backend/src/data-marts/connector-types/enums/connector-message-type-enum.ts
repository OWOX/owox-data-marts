export enum ConnectorMessageType {
  LOG = 'log',
  IS_IN_PROGRESS = 'isInProgress',
  STATUS = 'updateCurrentStatus',
  STATE = 'updateLastImportDate',
  CREDENTIALS_UPDATE = 'updateCredentials',
  FIELDS_UPDATE = 'updateFields',
  REQUESTED_DATE = 'updateLastRequstedDate',
  STATE_UPDATE = 'updateState',
  WARNING = 'addWarningToCurrentStatus',
  UNKNOWN = 'unknown',
  ERROR = 'error',
}
