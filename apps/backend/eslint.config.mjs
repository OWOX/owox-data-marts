// Migration to shared ESLint configuration
// Migrated to ES modules format for consistency with project setup
import { config } from '@owox/eslint-config/nestjs';

const requireAuthDecoratorRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require @Auth decorator on all HTTP endpoint methods',
      category: 'Security',
      recommended: true
    },
    fixable: null,
    schema: []
  },

  create(context) {
    const httpDecorators = ['Get', 'Post', 'Put', 'Delete', 'Patch'];
    
    function hasAuthDecorator(node) {
      if (!node.decorators) return false;
      
      return node.decorators.some(decorator => {
        if (decorator.expression.type === 'CallExpression') {
          const callee = decorator.expression.callee;
          return callee.name === 'Auth';
        }
        return false;
      });
    }
    
    function hasHttpDecorator(node) {
      if (!node.decorators) return false;
      
      return node.decorators.some(decorator => {
        if (decorator.expression.type === 'CallExpression') {
          const callee = decorator.expression.callee;
          return httpDecorators.includes(callee.name);
        }
        return false;
      });
    }
    
    function isInController(node) {
      let parent = node.parent;
      while (parent) {
        if (parent.type === 'ClassDeclaration') {
          return parent.id && parent.id.name.endsWith('Controller');
        }
        parent = parent.parent;
      }
      return false;
    }

    return {
      MethodDefinition(node) {
        if (!isInController(node)) return;
        if (!hasHttpDecorator(node)) return;
        if (!hasAuthDecorator(node)) {
          const httpDecorator = node.decorators.find(d => 
            d.expression.type === 'CallExpression' && 
            httpDecorators.includes(d.expression.callee.name)
          );
          
          const methodName = httpDecorator.expression.callee.name;
          
          context.report({
            node: node,
            message: `HTTP endpoint method with @${methodName} decorator must have @Auth decorator for security.`
          });
        }
      }
    };
  }
};

const customRules = {
  files: ['src/data-marts/controllers/**/*.controller.ts'],
  rules: {
    'local/require-auth-decorator': 'error'
  },
  plugins: {
    'local': {
      rules: {
        'require-auth-decorator': requireAuthDecoratorRule
      }
    }
  }
};

export default [
  ...config,
  customRules
];
