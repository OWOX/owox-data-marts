# Looker Studio
Looker Studio is a powerful data visualization tool that allows users to create interactive dashboards and reports.  
Integration with OWOX Data Marts as a **Destination** enables seamless data access and visualization.

---

## Configuration Steps

### OWOX Data Marts

#### 1. Access the Destinations Page
In the OWOX Data Marts web application, navigate to **Destinations** from the main navigation pane and click **+ New Destination**.

#### 2. Choose Destination Type
Select **Looker Studio** from the **Destination Type** dropdown.  

#### 3. Set General Settings and Connection Details
- **Title**: Provide a unique name for this Destination (e.g., "Analytics Warehouse").
- **Host URL**: Enter the public URL that Looker Studio will use to initiate the connection to OWOX Data Marts. This URL must be accessible over the internet and point to your OWOX Data Marts instance. To configure the public URL:
    - Ensure your OWOX Data Marts server is deployed with a publicly accessible endpoint (e.g., via a domain or load balancer).
    - Use a secure URL (HTTPS is recommended) to protect data in transit. Example: `https://owox-datamarts.yourdomain.com`.  

#### 4. Get Looker Studio connector configuration JSON
1. Review your entries and click **Generate connector configuration** to persist the Looker Studio connector configuration and get the configuration JSON for the OWOX Data Marts connector for Looker Studio or **Cancel** to discard changes.
2. Copy the configuration JSON and click **Save** to save the configuration and exit.

---

### Looker Studio

#### 1. Add OWOX Data Marts connector as a source for Looker Studio report
1. Open [Looker Studio](https://lookerstudio.google.com/).
2. Create a new report or edit an existing one.
3. Click **Add data** and select the [OWOX Data Marts connector](https://datastudio.google.com/datasources/create?connectorId=OWOXDataMarts)
4. Enter the **Looker Studio connector configuration JSON** configured in OWOX Data Marts **Destination**
5. Select the desired **Data Mart** to visualize its data.

---

## Key Considerations
- The **Host URL** must remain accessible for Looker Studio to maintain the connection.
- Ensure firewall or network settings allow inbound traffic to the **Host URL** from Looker Studio’s IP ranges.
- For additional guidance or troubleshooting, refer to the [OWOX Community](https://github.com/OWOX/owox-data-marts/discussions).
