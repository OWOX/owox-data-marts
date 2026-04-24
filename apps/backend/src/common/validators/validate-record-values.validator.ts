import { plainToInstance } from 'class-transformer';
import {
  registerDecorator,
  validate,
  ValidationArguments,
  ValidationError,
  ValidationOptions,
} from 'class-validator';
import { isPlainObject } from '../utils/is-plain-object.util';

type Constructor<T> = new (...args: never[]) => T;

// Per-(instance, property) failure summaries so two @ValidateRecordValues decorators on
// the same DTO cannot clobber each other's state during parallel validation.
const failureSummaries = new WeakMap<object, Map<string, string>>();

function setSummary(target: object, property: string, summary: string): void {
  let bucket = failureSummaries.get(target);
  if (!bucket) {
    bucket = new Map();
    failureSummaries.set(target, bucket);
  }
  bucket.set(property, summary);
}

function clearSummary(target: object, property: string): void {
  failureSummaries.get(target)?.delete(property);
}

function getSummary(target: object, property: string): string | undefined {
  return failureSummaries.get(target)?.get(property);
}

function firstFailureReason(error: ValidationError): string {
  const constraintMessages = error.constraints ? Object.values(error.constraints) : [];
  if (constraintMessages[0]) return constraintMessages[0];
  const childReason = error.children?.[0] ? firstFailureReason(error.children[0]) : undefined;
  return childReason ?? `invalid "${error.property}"`;
}

function summarizeErrors(key: string, errors: ValidationError[]): string {
  const first = errors[0];
  if (!first) return `"${key}" is invalid`;
  const reason = firstFailureReason(first);
  return `"${key}" ${first.property ? `has invalid "${first.property}": ${reason}` : reason}`;
}

export function ValidateRecordValues<T extends object>(
  type: Constructor<T>,
  validationOptions?: ValidationOptions
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'validateRecordValues',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [type],
      validator: {
        async validate(value: unknown, args: ValidationArguments) {
          clearSummary(args.object, args.property);
          if (value === null || value === undefined) return true;
          if (!isPlainObject(value)) {
            setSummary(args.object, args.property, 'value must be a plain object');
            return false;
          }

          const [Ctor] = args.constraints as [Constructor<T>];
          const entries = Object.entries(value);
          const nonObjectEntry = entries.find(([, raw]) => !isPlainObject(raw));
          if (nonObjectEntry) {
            setSummary(args.object, args.property, `"${nonObjectEntry[0]}" must be a plain object`);
            return false;
          }

          const results = await Promise.all(
            entries.map(async ([key, raw]) => ({
              key,
              errors: await validate(plainToInstance(Ctor, raw) as object, {
                whitelist: true,
                forbidNonWhitelisted: true,
                forbidUnknownValues: true,
              }),
            }))
          );
          const failed = results.find(r => r.errors.length > 0);
          if (!failed) return true;
          setSummary(args.object, args.property, summarizeErrors(failed.key, failed.errors));
          return false;
        },
        defaultMessage(args: ValidationArguments) {
          const [Ctor] = args.constraints as [Constructor<T>];
          const summary = getSummary(args.object, args.property);
          const suffix = summary ? `: ${summary}` : '';
          return `each value of ${args.property} must match ${Ctor.name}${suffix}`;
        },
      },
    });
  };
}
