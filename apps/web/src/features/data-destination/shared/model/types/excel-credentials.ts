/**
 * An Excel destination holds no secret: the add-in authenticates as the user and reads its own
 * data, so there is nothing for the server to store or for a form to ask for.
 */
export type ExcelCredentials = Record<string, never>;
