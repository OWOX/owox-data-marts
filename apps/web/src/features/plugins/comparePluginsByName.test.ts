import { describe, expect, it } from 'vitest';
import { comparePluginsByName } from './comparePluginsByName';

const plugin = (displayName: string, pluginId = displayName) => ({ displayName, pluginId });

const namesOf = (plugins: { displayName: string }[]) => plugins.map(p => p.displayName);

describe('comparePluginsByName', () => {
  it('ignores letter case', () => {
    const sorted = [plugin('Streaming'), plugin('attribution'), plugin('Gyroscope')].sort(
      comparePluginsByName
    );

    expect(namesOf(sorted)).toEqual(['attribution', 'Gyroscope', 'Streaming']);
  });

  it('reads numbers as numbers', () => {
    const sorted = [plugin('Plugin 10'), plugin('Plugin 2')].sort(comparePluginsByName);

    expect(namesOf(sorted)).toEqual(['Plugin 2', 'Plugin 10']);
  });

  it('gives plugins that share a name the same order, whatever order they arrive in', () => {
    const first = plugin('Fork', 'p1');
    const second = plugin('Fork', 'p2');

    expect([first, second].sort(comparePluginsByName)).toEqual([first, second]);
    expect([second, first].sort(comparePluginsByName)).toEqual([first, second]);
  });
});
