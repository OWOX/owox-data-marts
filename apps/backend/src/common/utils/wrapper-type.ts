/**
 * Hides a class behind a type alias in a `forwardRef` injection. SWC records a constructor
 * parameter's class in decorator metadata as soon as the module loads, which throws inside a
 * circular import; through this alias the metadata records `Object`, and `forwardRef` still
 * names the real class for Nest.
 */
export type WrapperType<T> = T;
