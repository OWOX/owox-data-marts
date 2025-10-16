/**
 * BaseEvent is a simple base class for all integration events.
 * It enforces a consistent shape and ensures only subclasses can be produced.
 *
 * Usage example:
 *
 * export class UserCreatedEvent extends BaseEvent<{ id: number; email: string }> {
 *   public readonly name = 'user.created' as const;
 *   constructor(id: number, email: string, occurredAt?: Date) {
 *     super({ id, email }, occurredAt);
 *   }
 * }
 */
export abstract class BaseEvent<TPayload extends object> {
  /** Human-readable event name, e.g., "user.created" */
  public abstract get name(): string;
  /** Structured data payload */
  public readonly payload: TPayload;
  /** ISO time when the event occurred */
  public readonly occurredAt?: string;

  protected constructor(payload: TPayload, occurredAt?: Date) {
    this.payload = payload;
    this.occurredAt = occurredAt ? occurredAt.toISOString() : undefined;
    // Freeze to keep event instances immutable once created
    Object.freeze(this);
  }
}
