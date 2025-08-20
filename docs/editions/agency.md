# OWOX Data Marts – Agency Edition

## Open-Source Self-Service Analytics Platform for Agencies

Collect data & automate the entire client-facing & internal reporting. No vendor lock-in, no forced workflows, and no third-party data sharing.

Self-managed open source analytics solution designed for agencies managing multiple clients:

- Empower clients and project managers to generate reports on the fly
- Reporting costs that don’t spike with agency growth
- _More dashboard and reports requests to manage?_ Not a big deal with centralized and controlled infrastructure.
- No credential sharing approvals required - it's 100% secure
- Customizable extraction and reporting logic by client / role / report

📘 [Quick Start Guide](https://docs.owox.com/docs/getting-started/quick-start/)
🌐 [Website](https://www.owox.com/?utm_source=github&utm_medium=referral&utm_campaign=readme&utm_content=agency) | 💬 [Join Community](https://github.com/OWOX/owox-data-marts/discussions) | 🆘 [Create an Issue](https://github.com/OWOX/owox-data-marts/issues)

## Why We Built This

Running a successful agency means growing your client base – but most existing marketing analytics tools for agencies punish you for growth. And that leads to an exponential SaaS subscription cost.

In addition, agencies often face the following challenges:

- Each client has its **own set of ad platforms** & sales CRM.
- Data analysts rewrite SQL queries and **build new dashboards from scratch** for every client.
- **Data privacy concerns**: you can't get permission to provide the client's credentials to 3rd-party data vendors.
- Lack of control over reporting logic, and each client waits for their own custom metrics.
- Data blending challenges – one extra column needed means three more tasks to handle.
- Analytics bandwidth is a bottleneck – reporting slows down when key people are out.

OWOX Data Marts Community Edition already gets you mostly covered. But the **Agency Edition** is designed specifically for reporting to multiple clients with:

- multiple projects
- advanced access control
- full logging
- conversational UI

It empowers agencies to automate all client analytics & reports delivery without reinventing the wheel.

⭐ **Like this project?** [Star the repo to support future development!](https://github.com/OWOX/owox-data-marts)

## What You Can Do with OWOX Data Marts – Agency Edition

### Power Your Clients' Data Marts

Bring together client data from various ad platforms, CRMs, or financial systems and turn it into **business-ready Data Marts**, ready for reporting. With no limits on # of data sources, data marts, or refreshing schedule, you can:

- Combine data from multiple sources under one roof and build **a single source of truth** for each client.
- Reuse your **logic** across multiple client projects.
- **Avoid SaaS limitations and cost-scaling**.

### Organize Data for Scalable Reporting

Define a **semantic layer** for each client project, ensuring that KPIs and metrics are consistent across reports:

- Set relationships between data marts.
- Build **multi-source data marts** from multiple platforms and tables using SQL.
- Keep logic **centralized and reusable**.

This approach allows agencies to **scale operations efficiently** and onboard new clients quickly without starting from scratch.

### Enable Self-Service Reporting for Clients

Automate data delivery from 3rd party platforms or corporate DWH to reports, giving clients access to **trusted, pre-defined data marts** using:

- Google Sheets;
- Looker Studio;
- Excel, Power BI, or Tableau.

Clients gain the freedom to explore data independently, while your team retains control over:

- Data accuracy and governance
- Refresh schedules
- Access rights and data visibility

## How It Works

1. **Open your terminal** and run:

   ```bash
   npm install -g owox
   ```

2. **Start OWOX Data Marts** locally

   ```bash
   owox serve
   ```

  (You should see something like:
   🚀 Starting OWOX Data Marts...
   📦 Starting server on port 3000...)

3. Go to **<http://localhost:3000>** and enjoy! 🎉

Note: Check out [this doc](../../apps/owox/CONTRIBUTING.md) for advanced setup and CLI commands.

## Build New Connectors

Agencies often need **niche connectors** not available in off-the-shelf tools. With OWOX Data Marts, you can:

- Build new connectors to your unique APIs using our framework;
- Maintain **full transparency** of data extraction;
- Share contributions with the community (optional) to grow the ecosystem.

📌 [Check Open Requests](https://github.com/OWOX/owox-data-marts/issues)
📘 [Read the Contributor Guide](https://github.com/OWOX/owox-data-marts/CONTRIBUTING.md)  

⭐ **Liked this project?** [Star the repo to support future development!](https://github.com/OWOX/owox-data-marts)
