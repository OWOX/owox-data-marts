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
   * @param {string} params.message - Formatted notification message
   */
  static async send(params) {
    const { webhookUrl, message } = params;

    if (!webhookUrl || !webhookUrl.trim()) {
      return;
    }

    try {
      const response = await EnvironmentAdapter.fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        },
        payload: JSON.stringify({ text: message })
      });

      if (response.getResponseCode() === 200) {
        console.log('Google Chat notification sent successfully');
      } else {
        console.error(`Google Chat notification failed with status: ${response.getResponseCode()}`);
      }
    } catch (error) {
      console.error('Failed to send Google Chat notification:', error);
    }
  }
}
