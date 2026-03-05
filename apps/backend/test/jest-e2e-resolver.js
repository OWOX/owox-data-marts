/**
 * Custom Jest resolver that handles ESM-style .js extension imports
 * in TypeScript source files. When a .js import fails to resolve,
 * it retries with .ts extension.
 */
module.exports = (request, options) => {
  const defaultResolver = options.defaultResolver;

  try {
    return defaultResolver(request, options);
  } catch (error) {
    // If the import ends with .js and failed to resolve, try .ts
    if (request.endsWith('.js')) {
      const tsRequest = request.replace(/\.js$/, '.ts');
      try {
        return defaultResolver(tsRequest, options);
      } catch {
        // Fall through to original error
      }
    }
    throw error;
  }
};
