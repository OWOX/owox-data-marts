export type DataMartRunAiSourceScope = 'artifact' | 'template';
export type DataMartRunAiSourceRoute =
  | 'full_generation'
  | 'refine_existing_sql'
  | 'explain_or_status'
  | 'reuse_existing_source'
  | 'refine_existing_source_sql'
  | 'create_new_source_sql'
  | 'edit_template_text';

export interface DataMartRunAiAssistantDefinition {
  sessionId: string;
  scope: DataMartRunAiSourceScope;
  route: DataMartRunAiSourceRoute;
  artifactId?: string | null;
  templateId?: string | null;
  turnId?: string | null;
}
