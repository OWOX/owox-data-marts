export interface GoogleServiceAccountCredentials {
  serviceAccount: string;
}

export function isGoogleServiceAccountCredentials(
  credentials: GoogleServiceAccountCredentials
): credentials is GoogleServiceAccountCredentials {
  return 'serviceAccount' in credentials;
}
