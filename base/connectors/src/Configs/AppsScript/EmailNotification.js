/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var EmailNotification = class EmailNotification {
  
  /**
   * Send email notification
   * @param {Object} params - Parameters object
   * @param {string} params.to - Email address(es) to send to (can be multiple separated by commas)
   * @param {string} params.subject - Email subject line
   * @param {string} params.message - Formatted notification message
   */
  static send(params) {
    const { to, subject, message } = params;
    
    if (!to || !to.trim()) {
      return;
    }

    try {
      // Handle multiple emails separated by commas and validate them
      const emailAddresses = to.split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0)
        .filter(email => this.isValidEmail(email))
        .join(',');

      if (!emailAddresses) {
        console.log('Email notification skipped: no valid email addresses found');
        return;
      }

      MailApp.sendEmail(
        emailAddresses,
        subject,
        message,
        { noReply: true }
      );

      console.log(`Email notification sent successfully to: ${emailAddresses}`);
    } catch (error) {
      console.error(`Failed to send email notification: ${error.message}`);
    }
  }

  /**
   * Validate email address format
   * @param {string} email - Email address to validate
   * @returns {boolean} - True if email is valid
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    if (!isValid) {
      console.log(`Invalid email address skipped: ${email}`);
    }
    
    return isValid;
  }
} 