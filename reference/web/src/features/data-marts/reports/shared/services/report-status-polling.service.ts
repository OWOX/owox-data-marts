import { reportService } from './report.service';
import { ReportStatusEnum } from '../enums';
import type { ReportResponseDto } from './types';

/**
 * Configuration for the report status polling service
 */
export interface ReportStatusPollingConfig {
  /**
   * Initial polling interval in milliseconds
   * This is used for the first few polls
   */
  initialPollingIntervalMs: number;

  /**
   * Number of initial polls to use the initial polling interval
   */
  initialPollCount: number;

  /**
   * Regular polling interval in milliseconds
   * This is used after the initial polls
   */
  regularPollingIntervalMs: number;
}

/**
 * Default configuration for the report status polling service
 */
export const DEFAULT_POLLING_CONFIG: ReportStatusPollingConfig = {
  initialPollingIntervalMs: 2000, // 2 seconds
  initialPollCount: 3,
  regularPollingIntervalMs: 5000, // 5 seconds
};

/**
 * Service for polling report statuses
 */
class ReportStatusPollingService {
  private pollingTimers = new Map<string, NodeJS.Timeout>();
  private pollCounters = new Map<string, number>();
  private config: ReportStatusPollingConfig = DEFAULT_POLLING_CONFIG;

  /**
   * Set the configuration for the polling service
   * @param config The configuration to set
   */
  setConfig(config: Partial<ReportStatusPollingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Start polling for a report's status
   * @param reportId The ID of the report to poll
   * @param onStatusUpdate Callback function to be called when the status is updated
   * @returns A function to stop polling
   */
  startPolling(reportId: string, onStatusUpdate: (report: ReportResponseDto) => void): () => void {
    // Stop any existing polling for this report
    this.stopPolling(reportId);

    // Reset the poll counter
    this.pollCounters.set(reportId, 0);

    const pollStatus = async () => {
      try {
        const pollCount = this.pollCounters.get(reportId) ?? 0;

        this.pollCounters.set(reportId, pollCount + 1);

        const report = await reportService.getReportById(reportId);

        onStatusUpdate(report);

        if (report.lastRunStatus !== ReportStatusEnum.RUNNING) {
          this.stopPolling(reportId);
          return;
        }

        // Determine the next polling interval
        const useInitialInterval = pollCount < this.config.initialPollCount;
        const interval = useInitialInterval
          ? this.config.initialPollingIntervalMs
          : this.config.regularPollingIntervalMs;

        // Schedule the next poll
        const timerId = setTimeout(() => {
          void pollStatus();
        }, interval);

        this.pollingTimers.set(reportId, timerId);
      } catch (error) {
        console.error(`Error polling report status for ${reportId}:`, error);
        // If there's an error, stop polling
        this.stopPolling(reportId);
      }
    };

    // Start polling immediately
    void pollStatus();

    // Return a function to stop polling
    return () => {
      this.stopPolling(reportId);
    };
  }

  /**
   * Stop polling for a report's status
   * @param reportId The ID of the report to stop polling for
   */
  stopPolling(reportId: string): void {
    const timerId = this.pollingTimers.get(reportId);
    if (timerId) {
      clearTimeout(timerId);
      this.pollingTimers.delete(reportId);
      this.pollCounters.delete(reportId);
    }
  }

  /**
   * Stop polling for all reports
   */
  stopAllPolling(): void {
    for (const reportId of this.pollingTimers.keys()) {
      this.stopPolling(reportId);
    }
  }

  /**
   * Check if a report is currently being polled
   * @param reportId The ID of the report to check
   * @returns True if the report is being polled, false otherwise
   */
  isPolling(reportId: string): boolean {
    return this.pollingTimers.has(reportId);
  }
}

// Create a singleton instance
export const reportStatusPollingService = new ReportStatusPollingService();
