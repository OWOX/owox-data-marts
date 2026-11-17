import type { ConsumptionBranch, ConsumptionProduct, ConsumptionProjection } from './cloud-billing';

const operationTitles: Readonly<Record<string, string>> = {
  PIPELINE: 'Pipeline',
  PIPELINE_DATASOURCE: 'Pipeline Data Source',
  PIPELINE_BY_REQUEST: 'On-Demand Pipeline',
  PIPELINE_BY_REQUEST_DATASOURCE: 'On-Demand Data Source',
  PLATFORM_PROCESS_RUN: 'Process Run',
  TRANSFORMATION_OPERATION_RUN: 'Transformation Operation Run',
  TRANSFORMATION_OPERATION_RUN_LITE: 'Transformation Operation Run',
  STREAMING_CLIENT_SIDE_USERS: 'Client-Side User',
  STREAMING_SERVER_SIDE_USERS: 'Server-Side User',
  SMART_DATA_REPORT_RUN_LITE: 'Report Run',
  DATA_MARTS_CONNECTOR_PROCESS_RUN: 'Connector Process Run',
  DATA_MARTS_DATA_QUALITY_PROCESS_RUN: 'Data Quality Process Run',
  DATA_MARTS_AI_PROCESS_RUN: 'AI Process Run',
  DATA_MARTS_HTTP_DATA_REPORT_RUN: 'HTTP Data Report Run',
  DATA_MARTS_MCP_QUERY_RUN: 'MCP Query Run',
  DATA_MARTS_SHEETS_REPORT_RUN: 'Google Sheets Report Run',
  DATA_MARTS_EXCEL_REPORT_RUN: 'Excel Report Run',
  DATA_MARTS_LOOKER_REPORT_RUN: 'Looker Studio Report Run',
  DATA_MARTS_EMAIL_REPORT_RUN: 'Email Report Run',
  DATA_MARTS_SLACK_REPORT_RUN: 'Slack Report Run',
  DATA_MARTS_GOOGLE_CHAT_REPORT_RUN: 'Google Chat Report Run',
  DATA_MARTS_MS_TEAMS_REPORT_RUN: 'MS Teams Report Run',
};

const columnTitles: Readonly<Record<string, string>> = {
  PRODUCT_NAME: 'Product',
  PROCESS_RUN_ENTITY_ID: 'Title',
  TRANSFORMATION_ID: 'Transformation',
  TRANSFORMATION_OPERATION_ID: 'Operation',
  STREAMING_ID: 'Streaming ID',
  GOOGLE_SHEETS_DOCUMENT: 'Google Sheets document',
  GOOGLE_SHEETS_DOCUMENT_LIST: 'Sheet',
};

export function readableName(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function consumptionProductTitle(product: string): string {
  return product === 'DATA_MARTS' ? 'OWOX Data Marts Cloud' : readableName(product);
}

export function consumptionOperationTitle(unit: string): string {
  return operationTitles[unit] ?? readableName(unit);
}

export function consumptionColumnTitle(label: string): string {
  return columnTitles[label] ?? readableName(label.replace(/_ID$/, ''));
}

export function googleSheetsConsumptionUrl(label: string, labels: ConsumptionBranch['labels']) {
  if (label !== 'GOOGLE_SHEETS_DOCUMENT' && label !== 'GOOGLE_SHEETS_DOCUMENT_LIST') return null;
  const documentId = labels.GOOGLE_SHEETS_DOCUMENT;
  if (!documentId || !/^[a-zA-Z0-9_-]+$/.test(documentId)) return null;

  const documentUrl = `https://docs.google.com/spreadsheets/d/${documentId}`;
  if (label === 'GOOGLE_SHEETS_DOCUMENT') return documentUrl;

  const sheetId = labels.GOOGLE_SHEETS_DOCUMENT_LIST;
  return sheetId && /^\d+$/.test(sheetId) ? `${documentUrl}/edit#gid=${sheetId}` : null;
}

export function resolveConsumptionLabel(
  label: string,
  value: string,
  labels: ConsumptionBranch['labels'],
  projections: ConsumptionProduct['entityProjections']
): { title: string; isDeleted?: boolean } {
  const type = label.replace(/_ID$/, '');
  let entity: ConsumptionProjection | undefined;
  switch (type) {
    case 'PRODUCT_NAME':
    case 'CONTEXT_TYPE':
      return { title: readableName(value) };
    case 'CONTEXT':
      entity = projections?.[labels.CONTEXT_TYPE]?.find(item => item.id === value);
      break;
    case 'GOOGLE_SHEETS_DOCUMENT_LIST':
      entity = projections?.GOOGLE_SHEETS_DOCUMENT?.find(
        item => item.id === labels.GOOGLE_SHEETS_DOCUMENT
      )?.childEntities?.find(item => item.id === value);
      break;
    case 'TRANSFORMATION_OPERATION':
      entity = projections?.TRANSFORMATION?.find(
        item => item.id === labels.TRANSFORMATION_ID
      )?.childEntities?.find(item => item.id === value);
      break;
    case 'PROCESS_RUN_ENTITY':
      if (labels.PRODUCT_NAME === 'TRANSFORMATION') {
        for (const transformation of projections?.TRANSFORMATION ?? []) {
          const operation = transformation.childEntities?.find(item => item.id === value);
          if (operation) {
            return {
              title: [transformation.title, operation.title].filter(Boolean).join(' · ') || value,
              isDeleted:
                transformation.isEntityDeleted === true || operation.isEntityDeleted === true,
            };
          }
        }
      } else if (labels.PRODUCT_NAME === 'PIPELINE') {
        entity = projections?.PIPELINE?.find(item => item.id === value);
      }
      break;
    case 'DATA_MART':
      entity =
        projections?.DATA_MART?.find(item => item.id === value) ??
        projections?.SMART_DATA_DATA_MART?.find(item => item.id === value);
      break;
    default:
      entity = projections?.[type]?.find(item => item.id === value);
  }
  return { title: entity?.title ?? value, isDeleted: entity?.isEntityDeleted };
}
