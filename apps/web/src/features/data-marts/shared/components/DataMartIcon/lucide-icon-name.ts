import { LUCIDE_ICON_PREFIX, type LucideIconValue } from '../../enums/data-mart-icon.enum';

/**
 * Kebab-case name of a lucide icon component (`ShoppingCart` → `shopping-cart`),
 * the same conversion lucide uses for its `lucide-*` class names.
 */
export function toLucideIconName(componentName: string): string {
  return componentName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Human label for a lucide icon name (`shopping-cart` → `Shopping cart`). */
export function lucideIconLabel(name: string): string {
  const words = name.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Whether an icon value names a lucide icon rather than a recommended key. */
export function isLucideIconValue(value: string | null | undefined): value is LucideIconValue {
  return typeof value === 'string' && value.startsWith(LUCIDE_ICON_PREFIX);
}
