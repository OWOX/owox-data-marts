import type {
  McpConnectorConfiguration,
  McpConnectorNode,
  McpConnectorParameter,
  McpConnectorSummary,
} from '../../../../data-marts/facades/mcp-connectors.facade';

export const sourceDataMartId = 'b7c2b085-9ebe-4ba0-85ce-6e713a00c0ad';

export const connectorSummary: McpConnectorSummary = {
  id: 'connector-1',
  name: 'CustomOrders',
  title: 'Замовлення',
  description: 'Orders from a project connector',
  docUrl: 'https://docs.example.test/orders',
  isCustom: true,
  activeVersion: 3,
  capabilities: { singleConfiguration: false, copySecretsByValue: true },
};

export const connectorSpecification: McpConnectorParameter[] = [
  {
    name: 'AccountId',
    title: 'Account',
    description: 'Choose the source account',
    default: 'all',
    requiredType: 'string',
    required: true,
    options: ['all', 'active'],
    placeholder: 'Account ID',
    minimum: 1,
    attributes: ['DYNAMIC_OPTIONS'],
    optionsDependsOn: ['Region'],
    oneOf: [
      {
        label: 'Choose an account',
        value: 'selected',
        requiredType: 'object',
        attributes: ['SECRET'],
        items: {
          AccountId: {
            name: 'AccountId',
            requiredType: 'number',
            required: true,
            minimum: 1,
          },
        },
      },
    ],
  },
  { name: 'Settings', requiredType: 'object', default: { useSandbox: false } },
  { name: 'Fields', requiredType: 'array', default: ['id', 'amount'] },
];

export const connectorNodes: McpConnectorNode[] = [
  {
    name: 'orders',
    overview: 'Source orders',
    description: 'Замовлення клієнтів',
    documentation: 'https://docs.example.test/orders/fields',
    uniqueKeys: ['id'],
    uniqueKeysByDataLevel: { account: ['accountId', 'id'] },
    defaultFields: ['id', 'amount'],
    destinationName: 'orders_raw',
    fields: [
      { name: 'id', type: 'string', description: 'Order identifier' },
      { name: 'amount', type: 'number' },
      { name: 'customField' },
    ],
  },
];

export const connectorConfiguration: McpConnectorConfiguration = {
  dataMartId: sourceDataMartId,
  dataMartTitle: 'Замовлення',
  configurationId: 'configuration-1',
  connectorName: 'CustomOrders',
  version: 3,
  configuration: {
    SecretKey: '********',
    AccountId: 'account-1',
    Settings: { useSandbox: false, includeTags: ['new'] },
  },
};
