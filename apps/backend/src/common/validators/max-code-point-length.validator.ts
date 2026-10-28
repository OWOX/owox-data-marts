import {
  registerDecorator,
  type ValidationOptions,
  type ValidationArguments,
} from 'class-validator';

export function maxCodePointLength(value: unknown, max: number): boolean {
  return typeof value === 'string' && Array.from(value).length <= max;
}

export function MaxCodePointLength(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'maxCodePointLength',
      target: object.constructor,
      propertyName,
      options,
      constraints: [max],
      validator: {
        validate: (value: unknown) => maxCodePointLength(value, max),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be shorter than or equal to ${max} characters`,
      },
    });
  };
}
