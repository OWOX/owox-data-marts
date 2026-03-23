import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/**
 * Validates that a JSON object's serialized size does not exceed the specified limit in bytes.
 * @param maxSizeBytes - Maximum size in bytes (default: 1MB = 1048576 bytes)
 * @param validationOptions - Optional validation options
 */
export function MaxJsonSize(maxSizeBytes: number = 1048576, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxJsonSize',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [maxSizeBytes],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (value === null || value === undefined) {
            return true;
          }

          try {
            const serialized = JSON.stringify(value);
            const sizeInBytes = Buffer.byteLength(serialized, 'utf8');
            const [maxSize] = args.constraints;
            return sizeInBytes <= maxSize;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          const [maxSize] = args.constraints;
          const maxSizeKb = Math.round(maxSize / 1024);
          return `${args.property} size exceeds maximum allowed size of ${maxSizeKb}KB`;
        },
      },
    });
  };
}
