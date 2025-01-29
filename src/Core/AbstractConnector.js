/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

class AbstractConnector {
  //---- constructor -------------------------------------------------
    /**
     * Asbstract class for Connectros
     * @param {configSheetRange} instance of Range class with config data. The first row must be a name of the parameter, the second one its value 
     * @param {configConnector} optional object with hardcoded config. Defined in inherited classes. configConnector data overwrites configSheetRange data 
     */
    constructor(config) {

      // Check if configRange is an instance of Range Class
      if( typeof config.setParametersValues !== "function" ) {
        throw new Error(`Unable to create an ${this.constructor.name} object. The first parameter must be inheritance of AbstractConfig class`)
      } 

      this.config = config;

    }
    //----------------------------------------------------------------

  //---- fetchData ---------------------------------------------------
    /**
     * A Data Source-specific methid is used to fetch new data and return it as an array of objects, where each property of an object corresponds to a column name.
     * @return data array 
     */  
    fetchData() {

      throw new Error("Method fetchData must be implemented in Class inheritor of AbstractConnector");

    }
    //----------------------------------------------------------------

  //---- getFieldsSchema ---------------------------------------------
    /**
     * returing two-levels object with schema details
     * first level with name and description properties for group name
     * the second one for the fields
     * @return object
     */  
    getFieldsSchema() {

      // filter only end points with fields
      return Object.fromEntries(
        Object.entries(this.fieldsSchema).filter(([_, value]) => value.fields)
      );

    }
    //----------------------------------------------------------------
  
}