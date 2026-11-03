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

// Backend tests compile through SWC, which sees one file at a time and records a decorated
// property's class in metadata as the module loads. That breaks on a circular entity import and
// cannot tell TypeORM a column's type from an enum, so entities must spell both out.
// See apps/backend/MODULAR_CONVENTIONS.md (Entities).
const swcSafeEntityTypesRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require Relation<T> on relations to a class and an explicit type on enum-like columns',
      recommended: true
    },
    fixable: null,
    schema: []
  },

  create(context) {
    const relationDecorators = ['ManyToOne', 'OneToOne', 'OneToMany', 'ManyToMany'];
    const columnDecorators = ['Column', 'PrimaryColumn'];
    // Wrappers whose metadata is not the class itself; Promise marks a lazy relation.
    const relationWrappers = ['Relation', 'Array', 'Promise'];
    const primitiveKeywords = ['TSStringKeyword', 'TSNumberKeyword', 'TSBooleanKeyword'];

    function decoratorCall(node, names) {
      return (node.decorators ?? [])
        .map(decorator => decorator.expression)
        .find(expression => expression.type === 'CallExpression' && names.includes(expression.callee.name));
    }

    // tsc drops null and undefined from a union before recording metadata.
    function significantType(typeNode) {
      if (typeNode?.type !== 'TSUnionType') return typeNode;
      const rest = typeNode.types.filter(t => t.type !== 'TSNullKeyword' && t.type !== 'TSUndefinedKeyword');
      return rest.length === 1 ? rest[0] : null;
    }

    function declaresColumnType(call) {
      const [first] = call.arguments;
      if (first?.type === 'Literal' && typeof first.value === 'string') return true;
      return call.arguments.some(
        arg =>
          arg.type === 'ObjectExpression' &&
          arg.properties.some(prop => prop.type === 'Property' && prop.key.name === 'type')
      );
    }

    return {
      PropertyDefinition(node) {
        const declared = node.typeAnnotation?.typeAnnotation;
        const name = node.key.name;

        // A union (X | null) already records Object under SWC, so only a bare class is unsafe.
        if (decoratorCall(node, relationDecorators)) {
          if (declared?.type === 'TSTypeReference' && !relationWrappers.includes(declared.typeName.name)) {
            context.report({
              node,
              message: `Relation '${name}' must be typed Relation<${declared.typeName.name}> (import type { Relation } from 'typeorm'): SWC-compiled tests fail on circular entity imports otherwise.`
            });
          }
          return;
        }

        const typeNode = significantType(declared);
        if (!typeNode) return;

        const column = decoratorCall(node, columnDecorators);
        if (!column || declaresColumnType(column)) return;
        const isPrimitive =
          primitiveKeywords.includes(typeNode.type) ||
          (typeNode.type === 'TSTypeReference' && typeNode.typeName.name === 'Date');
        if (!isPrimitive) {
          context.report({
            node,
            message: `Column '${name}' must declare its type (for a string enum: @Column({ type: 'varchar', ... })): TypeORM cannot infer it from SWC-compiled metadata in tests.`
          });
        }
      }
    };
  }
};

// One plugin object: flat config rejects the same plugin name bound to two different objects.
const localPlugin = {
  rules: {
    'require-auth-decorator': requireAuthDecoratorRule,
    'swc-safe-entity-types': swcSafeEntityTypesRule
  }
};

const customRules = {
  files: ['src/data-marts/controllers/**/*.controller.ts'],
  rules: {
    'local/require-auth-decorator': 'error'
  },
  plugins: {
    'local': localPlugin
  }
};

const entityRules = {
  files: ['src/**/*.entity.ts'],
  rules: {
    'local/swc-safe-entity-types': 'error'
  },
  plugins: {
    'local': localPlugin
  }
};

export default [
  ...config,
  customRules,
  entityRules
];
