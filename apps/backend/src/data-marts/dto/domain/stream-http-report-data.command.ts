import type { Role as RoleType } from '@owox/idp-protocol';
import type { RunContext } from '../schemas/http-data-run-metadata.schema';

export interface StreamHttpReportDataCommand {
  reportId: string;
  userId: string;
  projectId: string;
  roles: RoleType[];
  rawQuery: Record<string, unknown>;
  /** Where the caller is putting the rows, when it chose to say. Display only; client-reported. */
  runContext?: RunContext;
}
