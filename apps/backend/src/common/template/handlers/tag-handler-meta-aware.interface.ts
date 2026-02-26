export interface TagParameter {
  name: string;
  type: string;
  required: boolean;
  default?: string | number | boolean;
  description: string;
}

export interface TagMeta {
  name: string;
  alias?: string;
  description: string;
  parameters: TagParameter[];
}

export interface TagHandlerMetaAware {
  tagMetaInfo(): TagMeta;
}
