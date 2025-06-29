export enum DataDestinationType {
  GOOGLE_SHEETS = 'GOOGLE_SHEETS',
}

export function toHumanReadable(type: DataDestinationType): string {
  switch (type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return 'Google Sheets';
    default:
      return type;
  }
}
