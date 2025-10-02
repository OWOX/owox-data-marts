// Shared type for async request status across services and store
// Use this type to represent the lifecycle of API requests
export enum RequestStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
}

export const RequestStatusValues: readonly RequestStatus[] = [
  RequestStatus.IDLE,
  RequestStatus.LOADING,
  RequestStatus.LOADED,
  RequestStatus.ERROR,
] as const;
