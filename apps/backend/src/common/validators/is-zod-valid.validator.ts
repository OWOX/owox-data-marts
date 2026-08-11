import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { ZodTypeAny } from 'zod';

/**
 * Validates a property against an existing Zod schema, so the DTO layer and whatever else parses
 * the same value (e.g. an entity's TypeORM transformer) cannot disagree about what's valid.
 */
export function IsZodValid(schema: ZodTypeAny, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isZodValid',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [schema],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [zodSchema] = args.constraints as [ZodTypeAny];
          return zodSchema.safeParse(value).success;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} does not match the expected shape`;
        },
      },
    });
  };
}
