import type { TaskStatus } from '../../../enums/task-status.enum.ts';

export interface TaskStatusResponseDto {
  status: TaskStatus;
}
