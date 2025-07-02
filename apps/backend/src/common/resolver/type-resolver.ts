import { Injectable, Scope, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TypedComponent } from './typed-component.resolver';

/**
 * A service that resolves components based on their type.
 * This resolver automatically handles both singleton and transient components.
 */
@Injectable()
export class TypeResolver<TType, TComponent extends TypedComponent<TType>> {
  private readonly singletonMap = new Map<TType, TComponent>();
  private readonly transientTypeMap = new Map<TType, Type<TComponent>>();

  constructor(
    components: TComponent[],
    private readonly moduleRef?: ModuleRef
  ) {
    for (const component of components) {
      const componentType = component.constructor as Type<TComponent>;
      if (this.isTransientComponent(componentType)) {
        this.transientTypeMap.set(component.type, componentType);
      } else {
        this.singletonMap.set(component.type, component);
      }
      if (this.transientTypeMap.size > 0 && !this.moduleRef) {
        throw new Error('Transient components are only supported when using the ModuleRef');
      }
    }
  }

  /**
   * Resolves a component by its type.
   * This method automatically determines whether the component is singleton or transient
   * and returns the appropriate instance.
   *
   * @param type The type of the component to resolve
   * @returns A promise that resolves to the component instance
   */
  async resolve(type: TType): Promise<TComponent> {
    // First, check if it's a transient component
    if (this.transientTypeMap.has(type) && this.moduleRef) {
      const ComponentType = this.transientTypeMap.get(type)!;
      return this.moduleRef.create(ComponentType);
    }

    // Otherwise, it should be a singleton component
    const component = this.singletonMap.get(type);
    if (!component) {
      throw new Error(`No component found for type: ${type}`);
    }
    return component;
  }

  private isTransientComponent(componentType: Type<TComponent>): boolean {
    const metadata = Reflect.getMetadata('scope:options', componentType);
    return metadata && metadata.scope === Scope.TRANSIENT;
  }
}
