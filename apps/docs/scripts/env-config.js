// @ts-check

export const getConfig = () => {
  const { NODE_ENV, DOCS_SITE, DOCS_BASE, PUBLIC_GTM_ID } = process.env;

  const isProduction = NODE_ENV === 'production';
  const site = (isProduction && DOCS_SITE) || 'http://localhost:4321';
  const base = (isProduction && DOCS_BASE) || '';
  const gtmId = PUBLIC_GTM_ID || '';

  return { site, base, gtmId };
};
