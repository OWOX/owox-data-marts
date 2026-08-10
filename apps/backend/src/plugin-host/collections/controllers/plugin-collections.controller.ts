import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, RequirePluginAuth, type AuthorizationContext } from '../../../idp';
import { Role, Strategy } from '../../../idp/types/role-config.types';
import {
  PluginCollectionDocumentApiDto,
  PluginCollectionPageApiDto,
  PutPluginCollectionDocumentApiDto,
} from '../dto/presentation/plugin-collection-api.dto';
import { PluginCollectionMapper } from '../mappers/plugin-collection.mapper';
import { DeletePluginCollectionDocumentService } from '../use-cases/delete-plugin-collection-document.service';
import { GetPluginCollectionDocumentService } from '../use-cases/get-plugin-collection-document.service';
import { ListPluginCollectionDocumentsService } from '../use-cases/list-plugin-collection-documents.service';
import { PutPluginCollectionDocumentService } from '../use-cases/put-plugin-collection-document.service';

@ApiTags('Plugin collections')
@Controller('plugins/runtime/collections')
@Auth(Role.viewer(Strategy.PARSE))
@RequirePluginAuth()
export class PluginCollectionsController {
  constructor(
    private readonly listDocuments: ListPluginCollectionDocumentsService,
    private readonly getDocument: GetPluginCollectionDocumentService,
    private readonly putDocument: PutPluginCollectionDocumentService,
    private readonly deleteDocument: DeletePluginCollectionDocumentService,
    private readonly mapper: PluginCollectionMapper
  ) {}

  @Get(':collectionName/documents')
  @ApiOkResponse({ type: PluginCollectionPageApiDto })
  list(
    @Param('collectionName') collectionName: string,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginCollectionPageApiDto> {
    return this.listDocuments.run(
      this.mapper.toListCommand(collectionName, limit, cursor, context)
    );
  }

  @Get(':collectionName/documents/:documentId')
  @ApiOkResponse({ type: PluginCollectionDocumentApiDto })
  get(
    @Param('collectionName') collectionName: string,
    @Param('documentId') documentId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginCollectionDocumentApiDto> {
    return this.getDocument.run(this.mapper.toGetCommand(collectionName, documentId, context));
  }

  @Put(':collectionName/documents/:documentId')
  @ApiOkResponse({ type: PluginCollectionDocumentApiDto })
  put(
    @Param('collectionName') collectionName: string,
    @Param('documentId') documentId: string,
    @Body() dto: PutPluginCollectionDocumentApiDto,
    @AuthContext() context: AuthorizationContext
  ): Promise<PluginCollectionDocumentApiDto> {
    return this.putDocument.run(this.mapper.toPutCommand(collectionName, documentId, dto, context));
  }

  @Delete(':collectionName/documents/:documentId')
  @HttpCode(204)
  @ApiNoContentResponse()
  async delete(
    @Param('collectionName') collectionName: string,
    @Param('documentId') documentId: string,
    @AuthContext() context: AuthorizationContext
  ): Promise<void> {
    await this.deleteDocument.run(this.mapper.toGetCommand(collectionName, documentId, context));
  }
}
