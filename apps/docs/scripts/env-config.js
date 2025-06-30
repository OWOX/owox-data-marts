export const getConfig = () => {
  const { NODE_ENV, DOCS_SITE, DOCS_BASE } = process.env;

  const isProduction = NODE_ENV === 'production';
  const site = (isProduction && DOCS_SITE) || 'http://localhost:4321';
  const base = (isProduction && DOCS_BASE) || '';

  return { site, base };
};
