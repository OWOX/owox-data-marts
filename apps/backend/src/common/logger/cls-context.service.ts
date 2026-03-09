import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

export type ClsKey<TContext> = string & {
  readonly __clsContextType?: TContext;
};

export const createClsKey = <TContext>(key: string): ClsKey<TContext> => key as ClsKey<TContext>;

@Injectable()
export class ClsContextService {
  constructor(private readonly cls: ClsService) {}

  get<TContext>(key: ClsKey<TContext>): TContext | undefined {
    return this.cls.get(key as never) as TContext | undefined;
  }

  set<TContext>(key: ClsKey<TContext>, context: TContext): void {
    this.cls.set(key as never, context as never);
  }

  update<TContext extends object>(key: ClsKey<TContext>, partial: Partial<TContext>): void {
    const current = this.get<TContext>(key) ?? ({} as TContext);
    this.set(key, { ...current, ...partial } as TContext);
  }

  async runWithContext<TContext extends object, TResult>(
    key: ClsKey<TContext>,
    context: TContext,
    callback: () => Promise<TResult> | TResult
  ): Promise<TResult> {
    if (this.cls.isActive()) {
      const previousContext = this.get<TContext>(key);
      this.update<TContext>(key, context);

      try {
        return await callback();
      } finally {
        if (previousContext) {
          this.set(key, previousContext);
        } else {
          this.set(key, {} as TContext);
        }
      }
    }

    return this.cls.run(async () => {
      this.set(key, context);
      return callback();
    });
  }
}
