/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GoogleSheetsConnector = class GoogleSheetsConnector extends AbstractConnector {
  constructor(config, source, storageName = 'GoogleBigQueryStorage', runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  async startImportProcess() {
    const nodeName = 'sheet';
    const data = await this.source.fetchData();
    const fields = Object.keys(this.source.fieldsSchema[nodeName].fields);

    this.config.Fields = {
      ...(this.config.Fields || {}),
      value: fields.map(field => `${nodeName} ${field}`).join(', '),
    };
    this.config.updateFields(fields);

    this.config.logMessage(
      data.length
        ? `${data.length} rows were fetched from Google Sheets`
        : 'No data rows were fetched from Google Sheets'
    );

    const storage = await this.getStorageByNode(nodeName);
    await storage.replaceData(data);
  }

  async getStorageByNode(nodeName) {
    const nodeSchema = this.source.fieldsSchema[nodeName];
    if (!nodeSchema) {
      throw new Error(`Node '${nodeName}' is not defined in Google Sheets schema`);
    }

    if (!('uniqueKeys' in nodeSchema)) {
      throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
    }

    return new globalThis[this.storageName](
      this.config.mergeParameters({
        DestinationSheetName: { value: nodeSchema.destinationName },
        DestinationTableName: {
          value: this.getDestinationName(nodeName, this.config, nodeSchema.destinationName),
        },
      }),
      nodeSchema.uniqueKeys,
      nodeSchema.fields,
      `${nodeSchema.description} ${nodeSchema.documentation}`
    );
  }
};
