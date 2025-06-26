/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var YOUR_DATE_SOURCE_Source = class YOUR_DATE_SOURCE_Source extends AbstractSource {

  constructor( configRange ) {
  
    super( configRange.mergeParameters({
      StartDate: {
        isRequired: true,
        requiredType: "date",
        default: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      },
      EndDate: {
        isRequired: true,
        requiredType: "date",
        default: new Date()
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2
      },
      CleanUpToKeepWindow: {
        requiredType: "number"
      },
      DestinationSheetName: {
        isRequired: true,
        default: "Data"
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 30
      }
    }));
  
    //this.dateColumn = ["date"];
    //this.uniqueKeyColumns = ["date", "label"];
  
  }
  
  /*
  @param startDate start date
  @param endDate end date
  
  @return data array
  
  */
  fetchData(startDate, endDate)  {
  
    let data = [];
   
    //console.log(data);
    return data;
  
  }
    
  }