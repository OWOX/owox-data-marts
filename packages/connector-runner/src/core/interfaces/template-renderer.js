/* eslint-disable no-unused-vars */
/**
 * Interface for template rendering
 * Handles generation of execution templates for different environments
 */
class TemplateRenderer {
    /**
     * Render the execution template with the given dependencies
     * @param {Array} dependencies - List of dependencies to include in template
     * @returns {string} Rendered template content
     */
    render(dependencies) {
        throw new Error('render method must be implemented');
    }
}

module.exports = TemplateRenderer; 