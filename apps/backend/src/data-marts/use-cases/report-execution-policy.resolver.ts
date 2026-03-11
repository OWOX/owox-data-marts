import { Injectable } from '@nestjs/common';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { Report } from '../entities/report.entity';

const EMAIL_BASED_ROWS_LIMIT = 100;

export interface ReportExecutionPolicy {
  canReadNextBatch(): boolean;
  getMaxDataRowsPerBatch(): number | undefined;
  mapReadBatch(batch: ReportDataBatch): ReportDataBatch;
  shouldStopAfterBatch(): boolean;
  getStopReason(): string | null;
}

@Injectable()
export class ReportExecutionPolicyResolver {
  resolve(report: Report): ReportExecutionPolicy {
    if (report.isEmailBasedDestination()) {
      return new ProbeLimitedRowsExecutionPolicy(EMAIL_BASED_ROWS_LIMIT);
    }

    return new UnboundedExecutionPolicy();
  }
}

class ProbeLimitedRowsExecutionPolicy implements ReportExecutionPolicy {
  private rowsRead = 0;
  private rowsRendered = 0;
  private readonly probeLimit: number;

  constructor(private readonly renderLimit: number) {
    this.probeLimit = renderLimit + 1;
  }

  canReadNextBatch(): boolean {
    return this.rowsRead < this.probeLimit;
  }

  getMaxDataRowsPerBatch(): number | undefined {
    return this.probeLimit - this.rowsRead;
  }

  mapReadBatch(batch: ReportDataBatch): ReportDataBatch {
    const remainingRowsToProbe = this.probeLimit - this.rowsRead;
    const probedRows = batch.dataRows.slice(0, Math.max(remainingRowsToProbe, 0));
    this.rowsRead += probedRows.length;

    const remainingRowsToRender = this.renderLimit - this.rowsRendered;
    const renderedRows = probedRows.slice(0, Math.max(remainingRowsToRender, 0));
    this.rowsRendered += renderedRows.length;

    return new ReportDataBatch(renderedRows, batch.nextDataBatchId);
  }

  shouldStopAfterBatch(): boolean {
    return !this.canReadNextBatch();
  }

  getStopReason(): string | null {
    if (!this.shouldStopAfterBatch()) {
      return null;
    }

    return `Execution policy reached row probe limit (${this.probeLimit})`;
  }
}

class UnboundedExecutionPolicy implements ReportExecutionPolicy {
  canReadNextBatch(): boolean {
    return true;
  }

  getMaxDataRowsPerBatch(): number | undefined {
    return undefined;
  }

  mapReadBatch(batch: ReportDataBatch): ReportDataBatch {
    return batch;
  }

  shouldStopAfterBatch(): boolean {
    return false;
  }

  getStopReason(): string | null {
    return null;
  }
}
