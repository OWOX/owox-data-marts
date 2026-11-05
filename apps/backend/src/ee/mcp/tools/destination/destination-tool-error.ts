import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { logMcpToolError } from '../../observability/log-mcp-tool-error';

const SAFE_BAD_REQUEST_MESSAGES = new Set([
  'Only Looker Studio destinations support key rotation.',
  'Only Google Sheets destinations support a Drive folder.',
]);

/** Provider errors can contain saved Credential values. Return only fixed messages. */
export async function destinationToolCall<T>(
  execute: () => Promise<T>,
  operation?: 'delete'
): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    const status = error instanceof HttpException ? error.getStatus() : undefined;
    if (error instanceof BadRequestException && SAFE_BAD_REQUEST_MESSAGES.has(error.message)) {
      // Rebuild the exception to discard extra fields in its response.
      throw new BadRequestException(error.message);
    }
    if (status === 403) {
      throw new ForbiddenException('You do not have permission for this Destination operation.');
    }
    if (status === 404) {
      throw new NotFoundException('The Destination or Credential was not found in this project.');
    }
    if (status === 409) {
      throw new ConflictException(
        'The Destination operation conflicts with its current state. Read the Destination before retrying.'
      );
    }
    if (operation === 'delete' && error instanceof BusinessViolationException) {
      throw new BadRequestException('Cannot delete this Destination while Reports reference it.');
    }
    if (status === 400 || error instanceof BusinessViolationException) {
      throw new BadRequestException(
        'Check the supplied fields, Credential access, and Drive folder in OWOX before retrying this operation.'
      );
    }
    logMcpToolError(error, 'Destination operation');
    throw new InternalServerErrorException(
      'The Destination operation failed. Check its configuration in OWOX before retrying.'
    );
  }
}
