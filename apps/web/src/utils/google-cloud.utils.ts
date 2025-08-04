export interface ServiceAccountJson {
  project_id: string;
  client_id: string;
  client_email: string;
}

export interface ServiceAccountLink {
  url: string;
  email: string;
}

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
