import { BadRequestException } from '@nestjs/common';

/** Invalid caller-supplied controls, excluding defects in saved calculated fields. */
export class InvalidOutputControlsException extends BadRequestException {}
