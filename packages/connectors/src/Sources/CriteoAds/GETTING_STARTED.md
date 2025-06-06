To receive data from the Criteo source, please make a copy of the file ["Criteo. Template"](https://docs.google.com/spreadsheets/d/1g_-q8sR5PsbB4-MDK9DYOn-mIXjHcR10VaYhy66kdBk/copy). 

Fill in the required information:
- Start date
- Account ID
- Standard source
- Standard Medium

Data import begins on the selected **start date**. Note that selecting a long date range may prevent data from downloading due to large data volume.

![Criteo Start Date](res/criteo_startdate.png)

Please, fill your **Account ID**.

![Criteo Account ID](res/criteo_accountid.png)

Add standard source and medium, or leave as default.  

![Criteo Fields](res/criteo_source.png)

Then, press *OWOX -> Manage credentials*. 

![Criteo Credentials](res/criteo_credentials.png)

Add your Client ID and Secret received by this tutorial: [**Get Your Credentials**](https://developers.criteo.com/retail-media/docs/get-credentials)

![Criteo Secret](res/criteo_secret.png)

Press *Add credentials* and then, press *OWOX -> Import New Data*.

![Criteo Import Data](res/criteo_import.png)

The import process is complete when the Log data displays **"Import is finished"**. Your data will be available in new tab *Data*.

![Criteo Finished](res/criteo_success.png)

To include more data, press *OWOX -> CleanUp Expired Data*, add more days and import data again.