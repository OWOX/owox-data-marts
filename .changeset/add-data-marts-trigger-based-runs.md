---
'owox': minor
---

# Add trigger-based execution for connector and report runs

Connector and report runs are now processed through a task queue instead of running immediately in the background. This improves reliability by ensuring runs are not lost if the server restarts, and adds per-project concurrency limits to prevent overloading. Runs that cannot start due to concurrency limits are automatically retried. Includes a safety mechanism to detect and fail runs that were stuck waiting in the queue for too long.
