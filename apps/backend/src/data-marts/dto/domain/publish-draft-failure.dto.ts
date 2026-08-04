export class PublishDraftFailureDto {
  constructor(
    public readonly dataMartId: string,
    public readonly title: string,
    public readonly error: string
  ) {}
}
