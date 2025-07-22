export enum DataDestinationType {
  GOOGLE_SHEETS = 'GOOGLE_SHEETS',
  LOOKER_STUDIO_CONNECTOR = 'LOOKER_STUDIO_CONNECTOR',
}

export function toHumanReadable(type: DataDestinationType): string {
  switch (type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return 'Google Sheets';
    case DataDestinationType.LOOKER_STUDIO_CONNECTOR:
      return 'Looker Studio Connector';
    default:
      return type;
  }
}
