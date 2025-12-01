/**
 * User projection DTO
 */
export class UserProjectionDto {
  constructor(
    public readonly userId: string,
    public readonly fullName?: string | null,
    public readonly email?: string | null,
    public readonly avatar?: string | null
  ) {}
}
