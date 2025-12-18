export default function RedshiftConnectionTypeDescription() {
  return (
    <p>
      Choose between <strong>Serverless</strong> for Amazon Redshift Serverless workgroups or{' '}
      <strong>Provisioned</strong> for traditional Redshift clusters. Serverless automatically
      scales compute capacity, while Provisioned clusters offer more control over instance
      configuration.
    </p>
  );
}
