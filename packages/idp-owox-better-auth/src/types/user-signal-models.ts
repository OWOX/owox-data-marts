export interface UserSignal {
  userId: string;
  name: string;
  value: string;
  origin: string;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
}

export type UserSignalInput = Pick<UserSignal, 'userId' | 'name' | 'value' | 'origin'>;

export const MAX_USER_SIGNALS = 50;
