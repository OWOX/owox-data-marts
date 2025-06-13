import { Injectable } from '@nestjs/common';
import { TypedComponent } from './typed-component.resolver';

@Injectable()
export class TypeResolver<TType, TComponent extends TypedComponent<TType>> {
  private readonly map = new Map<TType, TComponent>();

  constructor(components: TComponent[]) {
    for (const c of components) {
      this.map.set(c.type, c);
    }
  }

  resolve(type: TType): TComponent {
    const component = this.map.get(type);
    if (!component) throw new Error(`No component found for type: ${type}`);
    return component;
  }
}
