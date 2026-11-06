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
export async function dataMartExecutionToolCall<T>(execute: () => Promise<T>): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    const safeMessage = safeMcpDataMartErrorMessage(error);
    if (safeMessage) throw new BadRequestException(safeMessage);
    const status = error instanceof HttpException ? error.getStatus() : undefined;
    if (status === 403)
      throw new ForbiddenException('You do not have permission for this Data Mart operation.');
    if (status === 404)
      throw new NotFoundException('The Data Mart, run, or schedule was not found.');
    if (status === 409)
      throw new ConflictException(
        'The operation conflicts with the current Data Mart or run state. Read its current status before retrying.'
      );
    if (status === 400 || error instanceof BusinessViolationException)
      throw new BadRequestException(
        'The Data Mart operation could not be completed. Check the run options, saved configuration, publication status, and schedule in OWOX.'
      );
    logMcpToolError(error, 'Data Mart execution');
    throw new InternalServerErrorException(
      'The Data Mart operation could not be completed. Check its current state in OWOX before retrying.'
    );
  }
}
