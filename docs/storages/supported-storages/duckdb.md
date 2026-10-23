# DuckDB

DuckDB is an analytical database that keeps its data in a single file.
This page details how to use DuckDB as a Storage in a self-managed OWOX Data Marts deployment: connectors load data into a file on the machine that runs OWOX Data Marts, so there is no warehouse to set up.

---

## Availability

DuckDB appears in the **New Storage** dialog when `DUCKDB_STORAGE_ENABLED` is `true`. If the variable is not set, it is `true` on deployments that keep their own data in SQLite (`DB_TYPE` is `sqlite` or not set) and `false` on all others. OWOX Data Marts Cloud does not offer DuckDB. The [Google Cloud Platform](../../getting-started/deployment-guide/google-cloud-platform.md) and [DigitalOcean](../../getting-started/deployment-guide/digitalocean.md) deployments run on MySQL, so DuckDB is off there by default.

The variable accepts `true` or `false` in any case; any other value stops OWOX Data Marts at startup. Setting it to `false` stops new DuckDB Storages from being created and does not affect existing ones. See [Environment Variables](../../getting-started/deployment-guide/environment-variables.md#duckdb-storage).

With `DB_TYPE=mysql`, set `DUCKDB_STORAGE_ENABLED=true` only when exactly one backend instance runs and `DUCKDB_DATA_DIR` is on a persistent disk: the files are local to that instance.

Connector runs, SQL editing and data quality checks need no license key. Preview, Report Runs to any Destination, HTTP Data and MCP need one, as on any Storage: see [Configure a Self-Managed License Key](../../getting-started/deployment-guide/license-key-setup.md). Looker Studio needs one to read data.

---

## Configuration Steps

### 1. Access the Storages Page

In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

### 2. Choose Storage Type

Click **DuckDB** in the **New Storage** dialog. OWOX Data Marts creates the Storage and opens its settings. It is ready to use: there are no credentials or connection details to fill in.

### 3. Review the Settings

- **Title**: To rename the Storage, enter a new title and click **Save**.
- **Database file path**, in the **Configuration** section: the file that connectors load into. Click it to copy. The file is created on the first connector run or read.

---

## Where the Data Lives

Each DuckDB Storage is one file, `<Storage ID>.duckdb`. By default the files are in a `duckdb` directory next to the SQLite database of OWOX Data Marts. To keep them elsewhere, set `DUCKDB_DATA_DIR` to a directory on a persistent disk. Changing it does not move existing files.

In the [Docker setup](../../getting-started/deployment-guide/local-deployment.md#option-2-deployment-via-container-image-recommended-for-docker-desktop-users), the directory is `/root/.local/share/owox/sqlite/duckdb` in the container and `~/owox-data/duckdb` on your computer. It is inside the mounted volume, so the data stays when you upgrade the container.

Backups are up to you: copy `<Storage ID>.duckdb` and, when it exists, `<Storage ID>.duckdb.wal`, while no load or read runs.

Deleting a DuckDB Storage leaves its files on disk. Delete them yourself when you no longer need the data.

---

## Loads and Reads

A connector run reserves the Storage for the whole load. It loads its configurations one at a time, each in its own process. OpenHolidays, for example, has one configuration per country. Each configuration holds the Storage's file from its first write until its process ends.

- A second connector run into the same Storage waits and starts when the first load ends. Loads into different DuckDB Storages run in parallel.
- A backfill holds the Storage for all of its segments, so other loads into it wait until the whole backfill ends.
- A run that waits more than 23 hours stays **Pending** and must be cancelled in **Run History**.
- A run left **Running** after the server stopped unexpectedly blocks the Storage until it is cancelled in **Run History**.
- A Report Run or data quality run that starts during a load, or while an earlier load waits for the Storage, stays **Pending** and starts after that load.
- A connector run waits the same way for the Report Runs and data quality runs that read the Storage. A Report Run reads until its write to the Destination ends.
- A preview, SQL run, HTTP Data, MCP or Looker Studio request does not wait for the whole load, only for the configuration that holds the file. It can see a load that is partly done. If the file stays busy for about 30 seconds, it fails with "DuckDB storage is busy (a load or query is in progress); retry shortly." A connector run that starts during such a read waits for it the same way.
- A report on a SQL Data Mart with output controls, calculated fields or joins also waits for other reads of the same Storage, up to about 30 seconds.

---

## Opening the File in Other Tools

You can query the file with DBeaver, Python or another client on DuckDB 2.0 or later. Open it read-only, and close it before loads run: while a tool keeps the file open, a load waits 30 seconds and then fails. Reports on SQL Data Marts with output controls, calculated fields or joins wait and fail the same way, because they refresh the Data Mart's view in the file.

---

## Time Zone

DuckDB Data Marts run in UTC, not in the server's time zone. In SQL Data Marts and reports, `current_date`, `now()`, a TIMESTAMPTZ cast to DATE, and TIMESTAMPTZ values shown as text use UTC. A date filter without a zone, such as `2024-03-01`, means midnight UTC. Date buckets use the time zone chosen in the report.

---

## Limitations

- **Data Last Updated** shows **Unknown** for DuckDB Data Marts: DuckDB does not expose a reliable per-table update time. See [Data Last Updated](../../getting-started/setup-guide/data-last-updated.md).
- Size and speed are bounded by the machine that runs OWOX Data Marts.
- A load or a read of a DuckDB file uses at most a quarter of the machine's memory, or of the container's memory limit when it is lower (at least 256 MB), half of its CPU cores and 10 GB of temporary disk space.
