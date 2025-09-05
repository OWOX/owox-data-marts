import { Request, Response, NextFunction } from 'express';

/**
 * Create timeout middleware for specific operations
 * @param timeoutMs timeout in milliseconds
 * @param operationName name of the operation for logging
 */
export function createOperationTimeoutMiddleware(timeoutMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as Request & { timeoutSet: boolean }).timeoutSet) {
      return next();
    }

    (req as Request & { timeoutSet: boolean }).timeoutSet = true;

    const timer = setTimeout(() => {
      if (!res.headersSent && !res.destroyed) {
        res.status(408).json({
          statusCode: 408,
          message: `Request timeout after ${timeoutMs / 1000} seconds`,
          timestamp: new Date().toISOString(),
          path: req.url,
        });
      }
    }, timeoutMs);

    const cleanup = () => clearTimeout(timer);

    res.on('finish', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    next();
  };
}
