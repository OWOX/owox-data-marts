/**
 * Configuration for the schema table toolbar.
 * Keeps business logic in DataMartSchemaSettings while allowing
 * presentation components to render toolbar actions.
 */
export interface SchemaToolbar {
  showAiHelper: boolean;

  refresh: {
    disabled: boolean;
    onClick: () => void;
  };

  ai: {
    disabled: boolean;
    loading: {
      metadata: boolean;
      aliases: boolean;
      descriptions: boolean;
    };
    onGenerateMetadata: () => void;
    onGenerateDescriptions: () => void;
    onGenerateAliases: () => void;
  };
}
