# Google Cloud Platform

> **Google Cloud Platform** lets you run serverless, container-based applications alongside a fully managed relational database
> – delivering autoscaling, reliability, and minimal operational overhead.
>
> Required services for deployment:
>
> * **Cloud Run** a fully managed application hosting that allows you to run container on top of Google's highly scalable infrastructure
> * **Cloud SQL**: a fully managed database service for MySQL, reducing your overall cost of operations and freeing up teams to focus on innovation

## Create a MySQL instance

Follow <https://console.cloud.google.com/sql/instances/create;engine=MySQL> link and further guide to create a MySQL instance.  

### Choose a Cloud SQL edition

**Enterprise** is OK for most deployments.

Choose a preset for this edition: start with **Sandbox** and tune as you go.

### Instance info

Database version: **MySQL 8.0**

**Instance ID**: `owox-data-marts-db`

**Password**: generate it and save for further configuration.

### Choose region and zonal availability

**Region**: choose a region you want to store OWOX Data Marts configuration

### Customize your instance

For more than 3x cost efficiency open "Customize your instance" → "Show configuration options" → "Machine configuration":
start with **Shared core** `1 vCPU, 1.7 GB` and tune as you go.

## Create a Cloud Run service

Follow <https://console.cloud.google.com/run/create?enableapi=true&deploymentType=container> link and further guide to create a Cloud Run service.
