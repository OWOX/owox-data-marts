import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Description for Databricks storage type.
 */
export default function StorageTypeDatabricksDescription() {
  return (
    <div className='text-muted-foreground space-y-2 text-sm'>
      <p>
        Databricks is a unified data analytics platform built on Apache Spark. It provides a
        lakehouse architecture that combines the best of data lakes and data warehouses.
      </p>
      <p>
        To connect OWOX to Databricks, you'll need your workspace URL, SQL warehouse HTTP path, and
        a Personal Access Token for authentication.
      </p>
      <p>
        Learn more in{' '}
        <ExternalAnchor
          className='underline'
          href='https://docs.owox.com/docs/storages/supported-storages/databricks/'
        >
          OWOX Databricks documentation
        </ExternalAnchor>
        .
      </p>
    </div>
  );
}
