# Deployment Guide

Self-managed OWOX Data Marts runs on your own infrastructure — your laptop, your cloud, your rules. This guide helps you pick a deployment path and configure it.

If you prefer not to host anything, use [OWOX Cloud Editions](../../editions/owox-cloud-editions.md) instead.

## Choose a deployment path

| Need | Read |
| --- | --- |
| Try it on your own computer in minutes | [Local Deployment](./local-deployment.md) |
| Run it on Google Cloud with Cloud Run and Cloud SQL | [Google Cloud Platform](./google-cloud-platform.md) |
| Deploy from a container image without managing servers | [Render](./render.md) |
| Use DigitalOcean App Platform and Managed MySQL | [DigitalOcean](./digitalocean.md) |

## Configure your deployment

Every deployment reads its configuration from environment variables — database connection, ports, logging, and authentication. See [Environment Variables](./environment-variables.md) for the full contract.

To enable Report Runs and bill them to an OWOX Data Marts Cloud project, add a license key. See [Configure a Self-Managed License Key](./license-key-setup.md).

## After deployment

1. Sign in and add a [Storage](../../storages/) for your data warehouse.
2. Create your first [Data Mart](../../data-marts/).
3. Invite your team in [Project Settings](../../project/).
