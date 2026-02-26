import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';

export class AiAssistantRunLogger {
  private readonly logsList: string[] = [];
  private readonly errorsList: string[] = [];

  constructor(private readonly systemTimeService: SystemTimeService) {}

  public pushLog(message: Record<string, unknown>): void {
    this.logsList.push(
      JSON.stringify({
        at: this.systemTimeService.now(),
        ...message,
      })
    );
  }

  public pushError(errorEntry: Record<string, unknown>): void {
    this.errorsList.push(
      JSON.stringify({
        type: 'error',
        at: this.systemTimeService.now(),
        ...errorEntry,
      })
    );
  }

  public get logs(): string[] {
    return this.logsList;
  }

  public get errors(): string[] {
    return this.errorsList;
  }
}
