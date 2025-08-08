# Looker Studio

Looker Studio is a powerful data visualization tool that allows users to create interactive dashboards and reports.  
Integration with Looker Studio as a **Destination** for OWOX Data Marts  enables seamless data access and visualization.

---

## Step 1. Create a Destination entity

- In the OWOX Data Marts web application, navigate to **Destinations** from the main navigation pane and click **+ New Destination**.
- Select **Looker Studio** from the **Destination Type** dropdown.
- Provide a **Title** — a unique name for this Destination (e.g., "Looker Studio Access (Marketing Team)").
- Enter the **Deployment URL** that Looker Studio will use to initiate the connection to OWOX Data Marts:
  - Use a secure URL (HTTPS is recommended) to protect data in transit. Example: `https://owox-data-marts.yourdomain.com`.
  - Ensure your OWOX Data Marts server is deployed with a publicly accessible endpoint (e.g., via a domain or load balancer).
    - If you use additional authorization to access your OWOX Data Marts server, make sure URLs with the pattern `/api/external/looker/*` are accessible over the internet and point to your OWOX Data Marts instance.
- Click **Save**.

---

## Step 2. Make a Data Mart accessible for Looker Studio

- Open the **Data Mart** you want to make accessible in Looker Studio and go to the **Destinations** tab.
- In the Looker Studio section, click **+ Add Report**.
- Provide a **Title** — a unique name for this connection (e.g., "Performance Report for Marketing Team").
- Select the **Destination** entity you created previously.
- Adjust the **Cache Lifetime** based on how you want to control data freshness when Looker Studio requests this data:
  - This defines the period during which results from previous query executions are served from the storage-side cache, eliminating the need to re-execute the query.
- Copy the **JSON Config** to your clipboard and click **Save**.

---

## Step 3. Add a Data Source in Looker Studio

- Find the [OWOX Data Marts connector](https://datastudio.google.com/datasources/create?connectorId=AKfycbz6kcYn3qGuG0jVNFjcDnkXvVDiz4hewKdAFjOm-_d4VkKVcBidPjqZO991AvGL3FtM4A) in Looker Studio's Gallery.
- **Authorize** with your Google Account (Looker Studio requires authorization to connect to data).
- Provide a **Configuration Display Name** — a unique name to help you distinguish different connections (e.g., "Marketing Data Connection").
- Paste the value from your clipboard into the **JSON Config** field and click **Next**.
- Select the **Connection Configuration** you created previously and click **Next**.
- Select a **Report** based on the Data Mart available via the provided Destination entity and click **Connect**.
- Make sure all the required fields are connected this Looker Studio's data source and click **Create Report** or **Explore**.
  - You can control the name and description of fields shown in Looker Studio via the **Output Schema** of the Data Mart in your OWOX Data Marts web application.

Connector in Looker Studio (first step):

![Create Data Mart-1](../../res/screens/connector-in-looker-studio-1st-step.png)


Connector in Looker Studio (second step):

![Create Data Mart-1](../../res/screens/connector-in-looker-studio-2nd-step.png)

---

## Key Considerations

- For additional guidance or troubleshooting, refer to the [OWOX Community](https://github.com/OWOX/owox-data-marts/discussions).
