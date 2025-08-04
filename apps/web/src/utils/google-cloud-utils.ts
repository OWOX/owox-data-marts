/**
 * Interface representing essential fields from a Google Cloud service account JSON file.
 * Contains the minimal required properties for generating service account management links.
 */
export interface ServiceAccountJson {
  project_id: string;
  client_id: string;
  client_email: string;
}

/**
 * Interface representing a Google Cloud service account management link and associated email.
 * Used for providing users with direct access to their service account configuration.
 */
export interface ServiceAccountLink {
  url: string;
  email: string;
}

/**
 * Generates a Google Cloud Console link for managing a service account.
 * Parses the service account JSON string and creates a direct link to the
 * service account details page in the Google Cloud Console.
 *
 * @param serviceAccountJson - JSON string containing service account credentials
 * @returns Service account link object with URL and email, or null if parsing fails
 */
export const getServiceAccountLink = (serviceAccountJson: string): ServiceAccountLink | null => {
  try {
    const parsed = JSON.parse(serviceAccountJson) as ServiceAccountJson;
    const { project_id, client_id, client_email } = parsed;

    if (!project_id || !client_id || !client_email) return null;

    return {
      url: `https://console.cloud.google.com/iam-admin/serviceaccounts/details/${client_id}?project=${project_id}`,
      email: client_email,
    };
  } catch {
    return null;
  }
};
