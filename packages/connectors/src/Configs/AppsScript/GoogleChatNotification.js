/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GoogleChatNotification = class GoogleChatNotification {
  
  /**
   * Send Google Chat notification
   * @param {Object} params - Parameters object
   * @param {string} params.webhookUrl - Google Chat webhook URL
   * @param {string} params.message - Notification message
   * @param {string} params.status - Current import status
   * @param {string} params.connectorName - Name of the connector
   */
  static send(params) {
    const { webhookUrl, message, status, connectorName } = params;
    
    console.log('GoogleChatNotification.send called with params:', JSON.stringify(params));
    
    if (!webhookUrl || !webhookUrl.trim()) {
      console.log('Google Chat notification skipped: no webhook URL provided');
      return;
    }

    console.log('Attempting to send Google Chat notification to:', webhookUrl);

    try {
      const cardMessage = {
        text: `${connectorName || "OWOX Data Connector"} - Status: ${status}\n\nDetails: ${message}`
      };

      console.log('Sending message:', JSON.stringify(cardMessage));

      const response = UrlFetchApp.fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        },
        payload: JSON.stringify(cardMessage)
      });

      console.log('Response code:', response.getResponseCode());
      console.log('Response text:', response.getContentText());

      if (response.getResponseCode() === 200) {
        console.log('Google Chat notification sent successfully');
      } else {
        console.error(`Google Chat notification failed with status: ${response.getResponseCode()}`);
      }
    } catch (error) {
      console.error(`Failed to send Google Chat notification: ${error.message}`);
      console.error('Error details:', error);
    }
  }

  /**
   * Get status-specific icon for Google Chat message
   * @param {string} status - Status value
   * @returns {string} Icon name
   */
  static getStatusIcon(status) {
    switch (status) {
      case "Done":
        return "CHECK_CIRCLE";
      case "Error":
        return "ERROR";
      case "Import in progress":
      case "CleanUp in progress":
        return "CLOCK";
      default:
        return "INFO";
    }
  }
} 