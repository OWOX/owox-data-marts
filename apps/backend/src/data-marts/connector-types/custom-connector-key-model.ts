import { BadRequestException } from '@nestjs/common';
import { Core } from '@owox/connectors';
import { castError } from '@owox/internal-helpers';
import type { CustomConnectorKeyModel } from './custom-connector-credential-fit';

/** What the parser reports about a manifest's keys; a manifest it refuses is a 400. */
export function customConnectorKeyModel(
  manifest: Record<string, unknown>
): CustomConnectorKeyModel {
  try {
    return new Core.ManifestParser().parse(JSON.stringify(manifest)) as CustomConnectorKeyModel;
  } catch (error) {
    throw new BadRequestException(`Invalid manifest: ${castError(error).message}`);
  }
}
