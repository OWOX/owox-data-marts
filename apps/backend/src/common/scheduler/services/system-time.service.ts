import { Injectable } from '@nestjs/common';

/**
 * Service that provides system time functionality.
 *
 * This service is used to get the current system time, which allows for easier testing
 * by providing a way to mock the time in tests.
 */
@Injectable()
export class SystemTimeService {
  /**
   * Returns the current date and time.
   *
   * @returns A new Date object representing the current date and time
   */
  now(): Date {
    return new Date();
  }
}
