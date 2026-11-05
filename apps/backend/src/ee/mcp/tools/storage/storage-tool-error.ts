import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';

const SAFE_BAD_REQUEST_MESSAGES = new Set([
  'Set the Storage configuration before selecting a Credential.',
  'Configure this Storage before listing resources.',
]);

export async function storageToolCall<T>(
  execute: () => Promise<T>,
  operation:
    | 'list'
    | 'get'
    | 'create'
    | 'update'
    | 'set_access'
    | 'validate'
    | 'list_resources'
    | 'delete'
): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    const status = error instanceof HttpException ? error.getStatus() : undefined;
    if (error instanceof BadRequestException && SAFE_BAD_REQUEST_MESSAGES.has(error.message)) {
      // Rebuild the exception to discard extra fields in its response.
      throw new BadRequestException(error.message);
    }
    if (operation === 'list_resources') {
      if (status === 403) {
        throw new ForbiddenException(
          'Check your permission to use this Storage and the provider permissions of its Credential.'
        );
      }
      if (status === 404) throw new NotFoundException('The Storage was not found.');
      if (status === 400) {
        throw new BadRequestException(
          'Check the Storage type, namespace, and saved connection before listing resources.'
        );
      }
      throw new BadGatewayException(
        'Storage resources could not be listed. Check the saved connection and provider permissions.'
      );
    }

    if (operation === 'delete' && error instanceof BusinessViolationException) {
      throw new BusinessViolationException(error.message);
    }
    if (status === 403) {
      throw new ForbiddenException(
        'You do not have permission for this Storage operation or to use its Credential.'
      );
    }
    if (status === 404) {
      throw new NotFoundException('The Storage or selected Credential was not found.');
    }
    if (status === 409) {
      throw new ConflictException('The Storage changed. Read it again before retrying.');
    }
    const message = {
      list: 'Storages could not be listed.',
      get: 'The Storage could not be read.',
      create: 'The Storage could not be created.',
      update: 'The Storage could not be updated. Check its configuration and Credential access.',
      set_access:
        'The Storage access settings could not be updated. Check the owners and Contexts.',
      validate: 'The Storage could not be validated. Check its configuration in OWOX.',
      delete: 'The Storage could not be deleted.',
    }[operation];
    if (status === 400 || error instanceof BusinessViolationException) {
      throw new BadRequestException(message);
    }
    throw new InternalServerErrorException(message);
  }
}
