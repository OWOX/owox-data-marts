import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { IDENTIFIER_ESCAPER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { IdentifierEscaper } from '../interfaces/identifier-escaper.interface';

@Injectable()
export class IdentifierEscaperFacade {
  constructor(
    @Inject(IDENTIFIER_ESCAPER_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, IdentifierEscaper>
  ) {}

  async escapeIdentifier(type: DataStorageType, identifier: string): Promise<string> {
    const escaper = await this.resolver.resolve(type);
    return escaper.escapeIdentifier(identifier);
  }
}
