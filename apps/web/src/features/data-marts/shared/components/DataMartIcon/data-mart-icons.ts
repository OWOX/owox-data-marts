import {
  Activity,
  BadgeDollarSign,
  Box,
  Calendar,
  Database,
  Eye,
  Flag,
  LifeBuoy,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Package,
  Receipt,
  Repeat,
  Search,
  ShoppingCart,
  Smartphone,
  Table,
  Target,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icons a user can pick for a Data Mart. The keys mirror the backend's closed
 * set — the API rejects any other key — so adding one means adding it there too.
 */
export const DATA_MART_ICON_OPTIONS = [
  { key: 'purchases', label: 'Purchases', icon: ShoppingCart },
  { key: 'orders', label: 'Orders', icon: Receipt },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'inventory', label: 'Inventory', icon: Warehouse },
  { key: 'revenue', label: 'Revenue', icon: TrendingUp },
  { key: 'finance', label: 'Finance', icon: Wallet },
  { key: 'ad-spend', label: 'Ad spend', icon: BadgeDollarSign },
  { key: 'campaigns', label: 'Campaigns', icon: Target },
  { key: 'traffic-sources', label: 'Traffic sources', icon: Megaphone },
  { key: 'sessions', label: 'Sessions', icon: MousePointerClick },
  { key: 'pageviews', label: 'Pageviews', icon: Eye },
  { key: 'events', label: 'Events', icon: Activity },
  { key: 'conversions', label: 'Conversions', icon: Flag },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'users', label: 'Users', icon: User },
  { key: 'leads', label: 'Leads', icon: UserPlus },
  { key: 'countries', label: 'Countries', icon: MapPin },
  { key: 'devices', label: 'Devices', icon: Smartphone },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'keywords', label: 'Keywords', icon: Search },
  { key: 'social', label: 'Social', icon: MessageCircle },
  { key: 'subscriptions', label: 'Subscriptions', icon: Repeat },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'support', label: 'Support', icon: LifeBuoy },
  { key: 'database', label: 'Database', icon: Database },
  { key: 'table', label: 'Table', icon: Table },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];

export type DataMartIconKey = (typeof DATA_MART_ICON_OPTIONS)[number]['key'];

/** Shown when a Data Mart has no icon picked. */
export const DEFAULT_DATA_MART_ICON: LucideIcon = Box;

const ICONS_BY_KEY = new Map<string, LucideIcon>(
  DATA_MART_ICON_OPTIONS.map(option => [option.key, option.icon])
);

/** The icon to draw for a Data Mart; unknown or missing keys fall back to the default. */
export function getDataMartIcon(key: string | null | undefined): LucideIcon {
  return (key ? ICONS_BY_KEY.get(key) : undefined) ?? DEFAULT_DATA_MART_ICON;
}
