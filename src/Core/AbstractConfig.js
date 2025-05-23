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
        requiredType: "number"
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
        //this.CONFIG[parameterName] = parameterName in this.CONFIG ? { ...this.CONFIG[parameterName], ...{"value": values[parameterName]} } : {"value": values[parameterName]}
        this[parameterName] = parameterName in this ? { ...this[parameterName], ...{"value": values[parameterName]} } : {"value": values[parameterName]}
      }

      return this;
    }
    //----------------------------------------------------------------

  //---- addParameter ------------------------------------------------
    /**
     * Adding parameter to config
     * @param name (string) parameter name
     * @param parameter (mixed) parameter values
     * @return Config object
     */  
    addParameter(name, value) {
      // If the name of the config parameter ends with *, it is required
        if( name.slice(-1) == "*" ) { 
          value.isRequired = true;
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
            throw new Error(parameter.errorMessage ? parameter.errorMessage : `Unable to load the configuration. The parameter ‘${name}’ is required but was provided with an empty value`)
          }

          // there is a type restriction for parameter values
          if( "requiredType" in parameter && parameter.value ) {

              if( !(["string", "number", "date"].includes( parameter.requiredType )) ) {

                throw new Error(`Parameter '${name}' has wrong requiredType in configuration`)

              // parameters must be eigher string or number
              } else if( ( parameter.requiredType == "string" || parameter.requiredType == "number" ) 
              && typeof parameter.value !== parameter.requiredType ) {

                throw new Error(`Parameter '${name}' must a a ${parameter.requiredType}. Got ${typeof parameter} instead`)

              // parameters must be a date
              } else if ( parameter.requiredType == "date"  
              && parameter.value.constructor.name != "Date" ) {

                throw new Error(`Parameter '${name}' must be a ${parameter.requiredType}. Got ${typeof parameter} instead`)

              }
        
          }

        };

        return this;

    }
    //----------------------------------------------------------------

  //---- updateCurrentStatus -----------------------------------------
    /**
     * @param string current status value
     */
    updateCurrentStatus(status) {

      throw new Error("updateCurrentStatus must be implemented in subclass of AbstractConfig");

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
}