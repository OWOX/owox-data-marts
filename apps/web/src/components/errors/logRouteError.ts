export function logRouteError(error: unknown): void {
  if (error instanceof Error) {
    console.error('[RouteError]', error.message, error.stack);
  } else if (error instanceof Response) {
    console.error('[RouteError] Response', error.status, error.statusText);
  } else {
    console.error('[RouteError] Unknown', error);
  }
}
