import type { Role as RoleType } from '@owox/idp-protocol';

export interface StreamHttpReportDataCommand {
  reportId: string;
  userId: string;
  projectId: string;
  roles: RoleType[];
  rawQuery: Record<string, unknown>;
}
