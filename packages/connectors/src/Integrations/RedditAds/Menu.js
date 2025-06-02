/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var Universal_Connector_Menu = (function () {

  /**
   * Generates the HTML template for the integration sidebar.
   * @param {string} connectorName - The name of the connector.
   * @param {Array} fields - An array of field objects to create input fields.
   * @param {string} validationFunction - The function name for validating input data.
   * @returns {GoogleAppsScript.HTML.HtmlOutput} - The sidebar interface.
   */
  function getHtmlTemplate(connectorName, fields, validationFunction) {
      return HtmlService.createHtmlOutput(`
          <!DOCTYPE html>
          <html>
            <head>
              <base target="_top">
              <style>
                .container { width: 280px; }
                .input-field { display: flex; flex-direction: column; margin-bottom: 10px; width: 100%; }
                .input-row { display: flex; justify-content: space-between; align-items: center; width: 100%; }
                .input-field label { flex: 1; min-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .input-field input { flex: 1.5; min-width: 140px; padding: 5px; }
                .tooltip { position: relative; display: inline-block; color: #4285F4; font-weight: bold; margin-left: 5px; cursor: pointer; }
                .tooltip .tooltip-text { 
                  visibility: hidden; width: 180px; background-color: #555; color: #fff; text-align: center; padding: 5px;
                  border-radius: 6px; position: absolute; z-index: 1000; right: 100%; top: 50%;
                  transform: translateY(-50%); opacity: 0; transition: opacity 0.3s ease-in-out; font-size: 12px; 
                }
                .tooltip:hover .tooltip-text { visibility: visible; opacity: 1; }
                .tooltip .tooltip-text::before { 
                  content: ""; position: absolute; top: 50%; left: 100%;
                  transform: translateY(-50%); border-width: 5px; border-style: solid;
                  border-color: transparent #555 transparent transparent; 
                }
                .error { color: red; font-size: 12px; margin-top: 5px; display: none; }
                .btn-container { display: flex; justify-content: space-between; margin-top: 10px; }
                .btn { background-color: #4285F4; color: white; border: none; padding: 10px; cursor: pointer; width: 100%; }
                
                /* Modal popups */
                .modal { display: none; position: fixed; z-index: 1000; left: 50%; top: 50%; transform: translate(-50%, -50%);
                         background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); width: 250px; text-align: center; }
                .modal h3 { margin: 0; font-size: 16px; }
                .modal p { margin: 10px 0; }
                .modal button { background: #4285F4; color: white; border: none; padding: 8px 16px; cursor: pointer; border-radius: 5px; margin-top: 10px; }
                .modal button:hover { background: #357ae8; }

              </style>
            </head>
            <body>
              <div class="container">
                <h3>${connectorName} Credentials</h3>
                
                ${fields.map(field => createInputField(field)).join('')}

                <div class="btn-container">
                  <button class="btn" onclick="validateAndSave()">Check and Save</button>
                </div>
              </div>

              <!-- Success Modal -->
              <div id="successModal" class="modal">
                <h3>✅ Success</h3>
                <p>Credentials saved successfully!</p>
                <button onclick="closeModal('successModal')">OK</button>
              </div>

              <!-- Error Modal -->
              <div id="errorModal" class="modal">
                <h3>❌ Error</h3>
                <p id="errorMessage"></p>
                <button onclick="closeModal('errorModal')">OK</button>
              </div>

              <script>
                /**
                 * Validates input fields and saves them if they pass validation.
                 */
                function validateAndSave() {
                  const fields = ${JSON.stringify(fields)};
                  let isValid = true;
                  let data = {};

                  fields.forEach(field => {
                    const input = document.getElementById(field.paramName);
                    const errorElement = document.getElementById('error-' + field.paramName);
                    let value = input.value.trim();

                    if (field.required && !value) {
                      errorElement.textContent = field.paramName + " is required";
                      errorElement.style.display = "block";
                      isValid = false;
                    } else if (field.regex_Rule && value && !new RegExp(field.regex_Rule).test(value)) {
                      errorElement.textContent = "Invalid format for " + field.paramName;
                      errorElement.style.display = "block";
                      isValid = false;
                    } else {
                      errorElement.style.display = "none";
                    }

                    data[field.paramName] = value;
                  });

                  if (!isValid) return;

                  google.script.run.withSuccessHandler(function(isValid) {
                    if (isValid) {
                      google.script.run.saveProperties(data);
                      showModal('successModal');
                    } else {
                      document.getElementById('errorMessage').textContent = "Invalid credentials. Please check your inputs.";
                      showModal('errorModal');
                    }
                  }).withFailureHandler(function(error) {
                    document.getElementById('errorMessage').textContent = "Error: " + error.message;
                    showModal('errorModal');
                  }).${validationFunction}(data);
                }

                /**
                 * Displays a modal popup.
                 * @param {string} modalId - The ID of the modal to show.
                 */
                function showModal(modalId) {
                  document.getElementById(modalId).style.display = 'block';
                }

                /**
                 * Closes a modal popup. If success modal is closed, also close the sidebar.
                 * @param {string} modalId - The ID of the modal to close.
                 */
                function closeModal(modalId) {
                  document.getElementById(modalId).style.display = 'none';
                  
                  // Close the sidebar if the success modal is closed
                  if (modalId === 'successModal') {
                    google.script.host.close();
                  }
                }
              </script>
            </body>
          </html>
      `).setTitle(connectorName + " Integration").setWidth(350);
  }

  /**
   * Creates an input field for a given parameter.
   * @param {Object} field - The field object with input details.
   * @returns {string} - The generated HTML input field.
   */
  function createInputField(field) {
      let tooltip = field.paramTip ? `
        <span class="tooltip">
          ? <span class="tooltip-text">${field.paramTip}${field.tipLink ? ` <a href='${field.tipLink}' target='_blank'>More info</a>` : ''}</span>
        </span>` : '';

      return `
        <div class="input-field">
          <div class="input-row">
            <label for="${field.paramName}">${field.paramName}</label>
            <input type="text" id="${field.paramName}" value="" />
            ${tooltip}
          </div>
          <div class="error" id="error-${field.paramName}"></div>
        </div>
      `;
  }

  return {
      getHtmlTemplate: getHtmlTemplate
  };
})();