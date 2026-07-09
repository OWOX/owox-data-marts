export type McpResourceContext =
  | {
      kind: 'shared';
      resource: string;
      publicBaseUrl: string;
      projectId: null;
    }
  | {
      kind: 'project';
      resource: string;
      publicBaseUrl: string;
      projectId: string;
    };
