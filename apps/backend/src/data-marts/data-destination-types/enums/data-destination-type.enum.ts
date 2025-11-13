export enum DataDestinationType {
  GOOGLE_SHEETS = 'GOOGLE_SHEETS',
  LOOKER_STUDIO = 'LOOKER_STUDIO',

  // Enterprise edition only
  EMAIL = 'EMAIL',
  SLACK = 'SLACK',
  MS_TEAMS = 'MS_TEAMS',
  GOOGLE_CHAT = 'GOOGLE_CHAT',
}

export function toHumanReadable(type: DataDestinationType): string {
  switch (type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return 'Google Sheets';
    case DataDestinationType.LOOKER_STUDIO:
      return 'Looker Studio';
    case DataDestinationType.EMAIL:
      return 'Email';
    case DataDestinationType.SLACK:
      return 'Slack';
    case DataDestinationType.MS_TEAMS:
      return 'Microsoft Teams';
    case DataDestinationType.GOOGLE_CHAT:
      return 'Google Chat';
    default:
      return type;
  }
}
