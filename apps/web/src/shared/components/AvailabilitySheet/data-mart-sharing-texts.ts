/**
 * What each Data Mart sharing flag means, in the words of the Share Data Mart
 * sheet. Everything that names a flag reads it from here, so the texts stay
 * the same wherever the flag shows.
 */
export const DATA_MART_SHARING_TEXTS = {
  availableForReporting: {
    label: 'Shared for reporting',
    description: 'All project members can see this Data Mart and build reports on it',
  },
  availableForMaintenance: {
    label: 'Shared for maintenance',
    description:
      'Members with the Data Owner role can edit, delete, and manage triggers for this Data Mart',
  },
} as const;
