import { isValidBigQueryFullyQualifiedName } from './bigquery-validation.utils';

describe('isValidBigQueryFullyQualifiedName', () => {
  it('should return true for valid 3-level names', () => {
    expect(isValidBigQueryFullyQualifiedName('project.dataset.table')).toBe(true);
    expect(isValidBigQueryFullyQualifiedName('my_project.my_dataset.my_table')).toBe(true);
    expect(isValidBigQueryFullyQualifiedName('project_1.dataset_1.table_1')).toBe(true);
    expect(isValidBigQueryFullyQualifiedName('my-project.my-dataset.my_table')).toBe(true); // hyphens allowed in project/dataset
  });

  it('should return false for SQL injection attempts with backticks', () => {
    expect(isValidBigQueryFullyQualifiedName('`project`.`dataset`.`table`')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('project.dataset.`table`')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('project.dataset.table`')).toBe(false);
  });

  it('should return false for SQL injection attempts with double quotes', () => {
    expect(isValidBigQueryFullyQualifiedName('project."dataset"."table"')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('project.dataset."table" UNION SELECT')).toBe(false);
  });

  it('should return false for SQL injection attempts with semicolon', () => {
    expect(isValidBigQueryFullyQualifiedName('project.dataset.table; DROP')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('project.dataset.table;DELETE')).toBe(false);
  });

  it('should return false for names with special characters', () => {
    expect(isValidBigQueryFullyQualifiedName('project.dataset.table*')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName("project.dataset.table'")).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('project.dataset.table/')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('project.dataset.table\\')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('project.dataset.table$')).toBe(false); // dollar not allowed in BigQuery
  });

  it('should return false for empty or invalid input', () => {
    expect(isValidBigQueryFullyQualifiedName('')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('single')).toBe(false);
    expect(isValidBigQueryFullyQualifiedName('project.dataset')).toBe(false); // only 2 levels
    expect(isValidBigQueryFullyQualifiedName('a.b.c.d')).toBe(false); // 4 levels
  });
});
