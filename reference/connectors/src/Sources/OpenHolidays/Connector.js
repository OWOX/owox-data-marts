/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var OpenHolidaysConnector = class OpenHolidaysConnector extends AbstractConnector {
    startImportProcess() {
        this.config.logMessage("🔄 Starting import process for public holidays");
        const data = this.source.fetchData();

        if (!data.length) {
            this.config.logMessage("ℹ️ No new holidays fetched during this import.");
            return;
        }

        this.storage.saveData(data);
        this.config.logMessage(`✅ ${data.length} holidays successfully imported.`);
    }
};