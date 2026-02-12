/**
 * Local module typings for DB drivers without TypeScript types.
 */
declare module 'better-sqlite3' {
  const Database: unknown;
  export = Database;
}

declare module 'mysql2/promise' {
  const mysql: unknown;
  export = mysql;
}
