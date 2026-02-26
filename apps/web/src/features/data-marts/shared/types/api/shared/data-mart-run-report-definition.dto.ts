export interface GoogleSheetsConfigDto {
  type: string;
  spreadsheetId: string;
  sheetId: number;
}

export interface LookerStudioConfigDto {
  type: string;
  cacheLifetime: number;
}

export type DataMartRunReportDestinationConfigDto = GoogleSheetsConfigDto | LookerStudioConfigDto;

export interface DataMartRunReportDefinitionDto {
  title: string;
  destination: {
    id: string;
    title: string;
    type: string;
  };
  destinationConfig: DataMartRunReportDestinationConfigDto;
}

export interface DataMartRunInsightDefinitionDto {
  title: string;
  template: string | null;
}

export interface InsightTemplateSourceDto {
  key: string;
  type: 'CURRENT_DATA_MART' | 'INSIGHT_ARTIFACT';
  artifactId?: string | null;
}

export interface DataMartRunInsightTemplateDefinitionDto {
  title: string;
  template: string | null;
  sources?: InsightTemplateSourceDto[] | null;
}

export type DataMartRunAiSourceScopeDto = 'artifact' | 'template';
export type DataMartRunAiSourceRouteDto =
  | 'full_generation'
  | 'refine_existing_sql'
  | 'explain_or_status'
  | 'reuse_existing_source'
  | 'refine_existing_source_sql'
  | 'create_new_source_sql'
  | 'edit_template_text';

export interface DataMartRunAiSourceDefinitionDto {
  sessionId: string;
  scope: DataMartRunAiSourceScopeDto;
  route: DataMartRunAiSourceRouteDto;
  artifactId?: string | null;
  templateId?: string | null;
  turnId?: string | null;
}
