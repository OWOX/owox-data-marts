import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/**
 * Validates that a string's UTF-8 length does not exceed the specified limit in bytes.
 *
 * The counterpart to `@MaxLength`, which counts CHARACTERS. Reach for this one whenever the
 * limit being honoured is itself a byte budget -- a MySQL `TEXT` column holds 65535 bytes
 * however many characters that is, and a kernel argument or environment string is likewise
 * capped in bytes. A character count in those positions accepts a value up to three times
 * over the real limit, and the failure it buys is either a 500 or, worse, a silent
 * truncation. Use `@MaxLength` for `varchar(n)`, which MySQL does count in characters.
 *
 * @param maxSizeBytes - Maximum UTF-8 size in bytes
 * @param validationOptions - Optional validation options
 */
export function MaxByteLength(maxSizeBytes: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxByteLength',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [maxSizeBytes],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          // Absent values are @IsOptional()'s business, and a non-string is @IsString()'s:
          // reporting them here too would only duplicate their errors.
          if (typeof value !== 'string') {
            return true;
          }

          const [maxSize] = args.constraints;
          return Buffer.byteLength(value, 'utf8') <= maxSize;
        },
        defaultMessage(args: ValidationArguments) {
          const [maxSize] = args.constraints;
          return `${args.property} must be shorter than or equal to ${maxSize} bytes`;
        },
      },
    });
  };
}
