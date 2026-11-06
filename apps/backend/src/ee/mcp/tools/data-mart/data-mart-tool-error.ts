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
import { safeMcpDataMartErrorMessage } from '../../../../data-marts/facades/mcp-data-mart-diagnostics';

/** Provider/legacy failures can contain connection details or configuration values. */
export async function dataMartToolCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const safeMessage = safeMcpDataMartErrorMessage(error);
    if (safeMessage) throw new BadRequestException(safeMessage);
    const status = error instanceof HttpException ? error.getStatus() : undefined;
    if (status === 403)
      throw new ForbiddenException(
        'You do not have permission for this Data Mart operation or a referenced resource.'
      );
    if (status === 404)
      throw new NotFoundException('The Data Mart or a referenced resource was not found.');
    if (status === 409)
      throw new ConflictException(
        'The operation conflicts with the current Data Mart state. Read its setup before retrying.'
      );
    if (status === 400 || error instanceof BusinessViolationException)
      throw new BadRequestException(
        'The Data Mart settings could not be accepted. Open the Data Mart in OWOX to inspect the detailed error.'
      );
    logMcpToolError(error, 'Data Mart management');
    throw new InternalServerErrorException(
      'The Data Mart operation could not be completed. Read its current state before retrying.'
    );
  }
}
