export function extractRunErrorMessage(errorStr: string): string {
  try {
    const parsed = JSON.parse(errorStr) as Record<string, unknown>;
    const message = parsed['error'] ?? parsed['message'] ?? parsed['msg'];
    return typeof message === 'string' ? message : errorStr;
  } catch {
    return errorStr;
  }
}
