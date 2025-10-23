/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

class AbstractConfig {
  //---- constructor -------------------------------------------------
    /**
     * @param (object) with config data. Properties are parameters names, values are values
     */
    constructor(configData) {
      this.addParameter('Environment', {
        value: AbstractConfig.detectEnvironment(),
        requiredType: "number",
        showInUI: false
      });

      for(var name in configData) {
        this.addParameter(name, configData[name]);
      };

      return this;
    }
    //----------------------------------------------------------------

  //---- static helper -------------------------------------------------
    /**
     * Determines the runtime environment
     * @returns {ENVIRONMENT} The detected environment
     */
    static detectEnvironment() {
      if (typeof UrlFetchApp !== 'undefined') {
        return ENVIRONMENT.APPS_SCRIPT;
      }

      if (typeof process !== 'undefined') {
        return ENVIRONMENT.NODE;
      }

      return ENVIRONMENT.UNKNOWN;
    }


  //---- mergeParameters ---------------------------------------------
    /**
     * Merge configuration to existing config
     * @param (object) with config data. Properties are parameters names, values are values
     * @return Config object
     */
    mergeParameters(configData) {

      for(var name in configData) {
        this.addParameter(name, configData[name]);
      }

      return this;
    }
    //----------------------------------------------------------------

  //---- setParametersValues -----------------------------------------
    /**
     * Set values of parameters
     * @param object with parameters' values
     * @return Config object
     */  
    setParametersValues(values) {
      
      for(var parameterName in values) {
        const trimmedValue = this._trimValue(values[parameterName]);
        this[parameterName] = parameterName in this ? { ...this[parameterName], ...{"value": trimmedValue} } : {"value": trimmedValue}
      }

      return this;
    }
    //----------------------------------------------------------------

  //---- addParameter ------------------------------------------------
    /**
     * Adding parameter to config
     * @param name (string) parameter name
     * @param value (mixed) parameter values
     * @return Config object
     */  
    addParameter(name, value) {
      // If the name of the config parameter ends with *, it is required
        if( name.slice(-1) == "*" ) { 
          value.isRequired = true;
        }

      if (value && typeof value.value === 'string') {
        value.value = this._trimValue(value.value);
      }

      // replace of characters including spaces to let call parameters like this.CONFIG.parameterName
        if( name = name.replaceAll(/[^a-zA-Z0-9]/gi, "") ) {

      // value is already exists in CONFIG
          //this.CONFIG[name] = name in this.CONFIG ? { ...this.CONFIG[name], ...parameter } : parameter
        this[name] = name in this ? { ...this[name], ...value } : value

        }

        return this;

    }
    //----------------------------------------------------------------

  //---- _validateParameterType --------------------------------------
    /**
     * Validate parameter type and convert if needed
     * @param {string} name - Parameter name
     * @param {Object} parameter - Parameter configuration
     * @private
     */
    _validateParameterType(name, parameter) {
      if (!("requiredType" in parameter) || parameter.value === null || parameter.value === undefined) {
        return;
      }

      const allowedTypes = ["string", "number", "date", "boolean", "object"];
      if (!allowedTypes.includes(parameter.requiredType)) {
        throw new Error(`Parameter '${name}' has wrong requiredType in configuration`);
      }

      // parameters must be either string or number
      if (parameter.requiredType === "string" || parameter.requiredType === "number") {
        if (typeof parameter.value !== parameter.requiredType) {
          throw new Error(`Parameter '${name}' must be a ${parameter.requiredType}. Got ${typeof parameter.value} instead`);
        }
        return;
      }

      // parameters must be a boolean
      if (parameter.requiredType === "boolean") {
        if (typeof parameter.value !== "boolean") {
          // Convert string "true"/"false" to boolean for backward compatibility
          if (typeof parameter.value === "string" && (parameter.value.toLowerCase() === "true" || parameter.value.toLowerCase() === "false")) {
            parameter.value = parameter.value.toLowerCase() === "true";
          } else {
            throw new Error(`Parameter '${name}' must be a ${parameter.requiredType}. Got ${typeof parameter.value} instead`);
          }
        }
        return;
      }

      // parameters must be a date
      if (parameter.requiredType === "date") {
        if (parameter.value && parameter.value.constructor.name !== "Date") {
          // Check if the value is a string and matches the format YYYY-MM-DD cast it to a date
          if (parameter.value.constructor.name === "String" && parameter.value.match(/^\d{4}-\d{2}-\d{2}$/)) {
            parameter.value = new Date(parameter.value);
          } else {
            throw new Error(`Parameter '${name}' must be a ${parameter.requiredType}. Got ${typeof parameter.value} instead`);
          }
        }
        return;
      }
    }
    //----------------------------------------------------------------

  //---- validate ----------------------------------------------------
    /**
     * Validate if all parameters meet restrictions
     * @return (boolean) true if valid, and throw an exception with error details otherwise.
     */
    validate() {

        // validating config
        for (let name in this) {

          let parameter = this[ name ];

          // there is default value, but there is no original value
          if( "default" in parameter && (!parameter.value && parameter.value !== 0) ) {
            parameter.value = parameter.default;
          }
          
          // if parameter's value is required but value is absent
          if( (!parameter.value && parameter.value !== 0) && parameter.isRequired == true) {
            throw new Error(parameter.errorMessage ? parameter.errorMessage : `Unable to load the configuration. The parameter '${name}' is required but was provided with an empty value`)
          }

          if (parameter.oneOf && Array.isArray(parameter.oneOf)) {
            this._validateOneOf(name, parameter);
            continue;
          }

          // Validate parameter type
          this._validateParameterType(name, parameter);

        };

        return this;

    }
    //----------------------------------------------------------------

  //---- validateOneOf -----------------------------------------------
    /**
     * Validate oneOf parameter structure
     * @param {string} name - Parameter name
     * @param {Object} parameter - Parameter configuration
     * @private
     */
    _validateOneOf(name, parameter) {
      // Check if value is set and matches one of the oneOf options
      if (!parameter.value) {
        if (parameter.isRequired) {
          throw new Error(`Parameter '${name}' is required but no value selected`);
        }
        return;
      }

      // Find the selected oneOf option
      const selectedOption = parameter.oneOf.find(opt => opt.value === parameter.value);
      
      if (!selectedOption) {
        const validValues = parameter.oneOf.map(opt => opt.value).join(', ');
        throw new Error(`Parameter '${name}' has invalid value '${parameter.value}'. Valid options: ${validValues}`);
      }

      // Validate nested items if they exist
      if (selectedOption.items && parameter.items) {
        for (const itemName in selectedOption.items) {
          const itemConfig = selectedOption.items[itemName];
          const itemValue = parameter.items[itemName];

          // Check if required item is present
          if (itemConfig.isRequired && (!itemValue || (!itemValue.value && itemValue.value !== 0))) {
            throw new Error(`Parameter '${name}.${itemName}' is required but was not provided`);
          }

          // Validate item type using shared validation method
          if (itemValue) {
            this._validateParameterType(`${name}.${itemName}`, itemValue);
          }
        }
      }
    }
    //----------------------------------------------------------------

  //---- handleStatusUpdate -----------------------------------------------
    /**
     * @param {Object} params - Parameters object with status and other properties
     * @param {number} params.status - Status constant
     * @param {string} params.error - Error message for Error status
     */
    handleStatusUpdate({ status, error }) {

      throw new Error("handleStatusUpdate must be implemented in subclass of AbstractConfig");

    }
    //----------------------------------------------------------------

  //---- updateLastImportDate ----------------------------------------
    /**
     * updating the last import attempt date in a config sheet
     */
    updateLastImportDate() {
      
      throw new Error("updateLastImportDate must be implemented in subclass of AbstractConfig");

    }
    //----------------------------------------------------------------

  //---- updateLastRequstedDate --------------------------------------
    /**
     * Updating the last requested date in a config sheet
     * @param date Date requested date
     */
    updateLastRequstedDate(date) {
      throw new Error("updateLastRequstedDate must be implemented in subclass of AbstractConfig");
    }
    //----------------------------------------------------------------

  //---- isInProgress ------------------------------------------------
    /**
     * Checking current status if it is in progress or not
     * @return boolean true is process in progress
     */
    isInProgress() {
      throw new Error("isInProgress must be implemented in subclass of AbstractConfig");
    }
    //----------------------------------------------------------------

  //---- addWarningToCurrentStatus -----------------------------------
    addWarningToCurrentStatus() {
      throw new Error("addWarningToCurrentStatus must be implemented in subclass of AbstractConfig");
    }
    //----------------------------------------------------------------

  //---- logMessage --------------------------------------------------
    logMessage() {
      throw new Error("logMessage must be implemented in subclass of AbstractConfig");
    }
    //----------------------------------------------------------------

  //---- trimValue ---------------------------------------------------
    /**
     * Automatically trim whitespace for string values
     * @param {*} value - Value to trim
     * @returns {*} - Trimmed value if string, original value otherwise
     */
    _trimValue(value) {
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    }
    //----------------------------------------------------------------
}
