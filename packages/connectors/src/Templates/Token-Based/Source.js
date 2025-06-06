/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var YOUR_DATE_SOURCE_Source = class YOUR_DATE_SOURCE_Source extends AbstractSource {

  constructor( configRange ) {
  
    super( configRange.mergeParameters({
      AccessToken: {
        isRequired: true,
      },
      DestinationSheetName: {
        isRequired: true,
        value: "Data"
      },
    }));
  

  
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