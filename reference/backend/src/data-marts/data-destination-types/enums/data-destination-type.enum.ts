export enum DataDestinationType {
  GOOGLE_SHEETS = 'GOOGLE_SHEETS',
  LOOKER_STUDIO = 'LOOKER_STUDIO',
}

export function toHumanReadable(type: DataDestinationType): string {
  switch (type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return 'Google Sheets';
    case DataDestinationType.LOOKER_STUDIO:
      return 'Looker Studio';
    default:
      return type;
  }
}
