import { describe, expect, it } from 'vitest';
import { describeVisibility } from './visibility';

describe('describeVisibility', () => {
  /**
   * Deployment listings are made by product-level administrators. That is the trust
   * signal on the card -- not "it is here because it is here", but "verified".
   */
  it('marks a deployment-wide plugin as verified', () => {
    expect(describeVisibility(['deployment'])?.audience).toBe('verified');
    expect(describeVisibility(['deployment'])?.summary).toBe('Verified');
    expect(describeVisibility(['deployment'])?.detail).toBe('Verified');
  });

  // Deployment is the trust signal: when it also has project/member scopes, the card
  // still says verified rather than drowning the seal under a personal or project mark.
  it('prefers verified when deployment is among the scopes', () => {
    expect(describeVisibility(['deployment', 'member'])?.audience).toBe('verified');
    expect(describeVisibility(['deployment', 'project'])?.audience).toBe('verified');
  });

  it('names the two states a member had a hand in', () => {
    expect(describeVisibility(['project'])?.audience).toBe('project');
    expect(describeVisibility(['member'])?.audience).toBe('you');
  });

  // Both apply, but the wider audience is the one that changes what others can see.
  it('reports the project audience when a plugin is listed both ways', () => {
    expect(describeVisibility(['member', 'project'])?.audience).toBe('project');
  });

  // §8.3: a member publication is visible only to its author, so "you" needs no lookup.
  it('tells a member their own listing is private to them', () => {
    expect(describeVisibility(['member'])?.detail).toContain('No one else in the project');
  });

  // Who put it there is not the reader's concern; what they can do with it is.
  it('describes a project listing by what it offers, not by who made it', () => {
    const detail = describeVisibility(['project'])?.detail ?? '';

    expect(detail).toContain('every member of this project');
    expect(detail).not.toMatch(/someone|added by/i);
  });

  it('explains a plugin nothing lists, which a direct link still reaches', () => {
    const visibility = describeVisibility([]);

    expect(visibility?.audience).toBe('unlisted');
    expect(visibility?.detail).toContain('direct link');
  });
});
