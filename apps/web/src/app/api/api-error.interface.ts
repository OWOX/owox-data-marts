export interface ApiError {
  message: string;
  path: string;
  statusCode: number;
  timestamp: string;
  errorDetails?: { error?: string }; // TODO: API may also return errors as an array, but we only handle a single error string for now
}
