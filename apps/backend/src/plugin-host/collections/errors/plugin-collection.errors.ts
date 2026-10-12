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

export class PluginCollectionNotEntityBoundError extends PluginCollectionValidationError {
  constructor(collectionName: string, semver: string) {
    super({
      code: 'PLUGIN_COLLECTION_NOT_ENTITY_BOUND',
      message: `Collection "${collectionName}" has no entityBinding in plugin.json of the current version ${semver}, so put does not accept parentId`,
    });
  }
}

export class PluginCollectionParentIdRequiredError extends PluginCollectionValidationError {
  constructor(collectionName: string, entityType: string, semver: string) {
    super({
      code: 'PLUGIN_COLLECTION_PARENT_ID_REQUIRED',
      message: `Collection "${collectionName}" has an entityBinding to ${entityType} in plugin.json of the current version ${semver}, so put requires parentId`,
    });
  }
}

export class PluginCollectionQuotaExceededError extends PayloadTooLargeException {
  constructor(limit: string) {
    super(`Plugin collection limit exceeded: ${limit}`);
  }
}
