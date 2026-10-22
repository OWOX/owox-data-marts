import type { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import type { PluginScheduleView } from './plugin-action-schedule.dto';

export interface ProjectPluginScheduleView {
  readonly schedule: PluginScheduleView;
  readonly pluginName: string;
  readonly installationState: 'installed' | 'uninstalled';
  readonly owner: UserProjectionDto | null;
  /** False while the owner is not an active member, so the runs are skipped; null when the IDP could not say. */
  readonly ownerIsMember: boolean | null;
  readonly canManage: boolean;
}

export interface ProjectPluginSchedulePage {
  readonly items: ProjectPluginScheduleView[];
  readonly total: number;
}
