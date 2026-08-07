import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';

export class PluginCollectionNotFoundError extends NotFoundException {
  constructor() {
    super('Plugin collection or document was not found');
  }
}

export class PluginCollectionAuthorizationDeniedError extends ForbiddenException {
  constructor() {
    super('The current member cannot perform this collection operation');
  }
}

export class PluginCollectionValidationError extends BadRequestException {}

export class PluginCollectionQuotaExceededError extends PayloadTooLargeException {
  constructor(limit: string) {
    super(`Plugin collection limit exceeded: ${limit}`);
  }
}
