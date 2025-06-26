/**
 * Keys that should be masked in Google BigQuery service account credentials
 */
export const SENSITIVE_KEYS = [
  'private_key',
  'private_key_id',
  'client_email',
  'client_id',
  'client_x509_cert_url',
];
