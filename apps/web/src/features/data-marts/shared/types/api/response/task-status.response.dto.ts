import type { TaskStatus } from '../../../../../../shared/types/task-status.enum.ts';

export interface TaskStatusResponseDto {
  status: TaskStatus;
}
