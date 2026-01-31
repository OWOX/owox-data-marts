import { TypeResolver } from './type-resolver';
import { TypedComponent } from './typed-component.resolver';

class ComponentA implements TypedComponent<string> {
  readonly type = 'A';
}

class ComponentB implements TypedComponent<string> {
  readonly type = 'B';
}

class ComponentC implements TypedComponent<string> {
  readonly type = 'C';
}

describe('TypeResolver', () => {
  it('resolves component by alias map', async () => {
    const resolver = new TypeResolver<string, TypedComponent<string>>(
      [new ComponentA()],
      undefined,
      new Map([['ALIAS', 'A']])
    );

    const component = await resolver.resolve('ALIAS');
    expect(component).toBeInstanceOf(ComponentA);
  });

  it('resolves component through alias chain', async () => {
    const resolver = new TypeResolver<string, TypedComponent<string>>(
      [new ComponentC()],
      undefined,
      new Map([
        ['A', 'B'],
        ['B', 'C'],
      ])
    );

    const component = await resolver.resolve('A');
    expect(component).toBeInstanceOf(ComponentC);
  });

  it('resolves component when alias chain contains a cycle', async () => {
    const resolver = new TypeResolver<string, TypedComponent<string>>(
      [new ComponentA(), new ComponentB()],
      undefined,
      new Map([
        ['A', 'B'],
        ['B', 'A'],
      ])
    );

    const component = await resolver.resolve('A');
    expect(component).toBeInstanceOf(ComponentA);
  });

  it('resolves component without alias map', async () => {
    const resolver = new TypeResolver<string, TypedComponent<string>>([new ComponentB()]);

    const component = await resolver.resolve('B');
    expect(component).toBeInstanceOf(ComponentB);
  });

  it('resolves component when alias map is empty', async () => {
    const resolver = new TypeResolver<string, TypedComponent<string>>(
      [new ComponentB()],
      undefined,
      new Map()
    );

    const component = await resolver.resolve('B');
    expect(component).toBeInstanceOf(ComponentB);
  });

  it('returns undefined when alias does not point to a component', async () => {
    const resolver = new TypeResolver<string, TypedComponent<string>>(
      [new ComponentA()],
      undefined,
      new Map([['MISSING', 'C']])
    );

    const component = await resolver.tryResolve('MISSING');
    expect(component).toBeUndefined();
  });

  it('throws when alias resolves to missing component via resolve', async () => {
    const resolver = new TypeResolver<string, TypedComponent<string>>(
      [new ComponentA()],
      undefined,
      new Map([['MISSING', 'C']])
    );

    await expect(resolver.resolve('MISSING')).rejects.toThrow('No component found for type');
  });
});
