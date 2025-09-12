import type { Reducer } from '../types';

export function combineReducers<Slices>(reducers: {
  [K in keyof Slices]: Reducer<Slices[K]>;
}): Reducer<{ [K in keyof Slices]: Slices[K] }> {
  return (state, action) => {
    const nextState = { ...state } as { [K in keyof Slices]: Slices[K] };

    (Object.keys(reducers) as (keyof Slices)[]).forEach(key => {
      const reducer = reducers[key];
      const prev = state[key];
      const updated = reducer(prev, action);
      if (updated !== prev) {
        nextState[key] = updated;
      }
    });

    return nextState;
  };
}
