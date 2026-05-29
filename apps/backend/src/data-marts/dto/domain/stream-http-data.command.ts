import type { Role as RoleType } from '@owox/idp-protocol';

export interface StreamHttpDataCommand {
  dataMartId: string;
  userId: string;
  projectId: string;
  roles: RoleType[];
  rawQuery: Record<string, unknown>;
}
