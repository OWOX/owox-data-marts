import { UserProjectionDto } from './user-projection.dto';

/**
 * Represents a Data Transfer Object (DTO) for a list of user projections.
 * This class provides functionalities to handle and retrieve specific user projections from the list.
 */
export class UserProjectionsListDto {
  constructor(public readonly projections: UserProjectionDto[]) {}

  public getByUserId(userId: string): UserProjectionDto | undefined {
    return this.projections.find(projection => projection.userId === userId);
  }
}
