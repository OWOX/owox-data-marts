export interface AnyAction {
  type: string;
  payload?: unknown;
}

export type Reducer<S> = (state: S, action: AnyAction) => S;
export type Dispatch = (action: AnyAction) => void;
