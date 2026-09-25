import {
  Activity,
  BadgeDollarSign,
  Box,
  Building2,
  Calendar,
  ChartNoAxesCombined,
  ChartPie,
  Coins,
  CreditCard,
  Database,
  Eye,
  FileText,
  Filter,
  Flag,
  FlaskConical,
  Gauge,
  Globe,
  Handshake,
  Image,
  LayoutTemplate,
  LifeBuoy,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  Newspaper,
  Package,
  Phone,
  Receipt,
  Repeat,
  Search,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Star,
  Store,
  Table,
  Target,
  TicketPercent,
  TrendingUp,
  Truck,
  Undo2,
  User,
  UserPlus,
  Users,
  Video,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { DataMartIconKey } from '../../enums/data-mart-icon.enum';

export type { DataMartIconKey } from '../../enums/data-mart-icon.enum';

/** Picker sections, in display order. */
export const DATA_MART_ICON_GROUPS = [
  'E-commerce & finance',
  'Marketing & ads',
  'Customers & sales',
  'Behavior & analytics',
  'General',
] as const;

export type DataMartIconGroup = (typeof DATA_MART_ICON_GROUPS)[number];

/**
 * Glyph and label for every icon key a user can pick (`DATA_MART_ICON_KEYS`),
 * in picker order.
 */
export const DATA_MART_ICON_OPTIONS = [
  { key: 'purchases', label: 'Purchases', icon: ShoppingCart, group: 'E-commerce & finance' },
  { key: 'orders', label: 'Orders', icon: Receipt, group: 'E-commerce & finance' },
  { key: 'products', label: 'Products', icon: Package, group: 'E-commerce & finance' },
  { key: 'inventory', label: 'Inventory', icon: Warehouse, group: 'E-commerce & finance' },
  { key: 'carts', label: 'Carts', icon: ShoppingBag, group: 'E-commerce & finance' },
  { key: 'shipping', label: 'Shipping', icon: Truck, group: 'E-commerce & finance' },
  { key: 'stores', label: 'Stores', icon: Store, group: 'E-commerce & finance' },
  { key: 'promotions', label: 'Promotions', icon: TicketPercent, group: 'E-commerce & finance' },
  { key: 'payments', label: 'Payments', icon: CreditCard, group: 'E-commerce & finance' },
  { key: 'invoices', label: 'Invoices', icon: FileText, group: 'E-commerce & finance' },
  { key: 'refunds', label: 'Refunds', icon: Undo2, group: 'E-commerce & finance' },
  { key: 'subscriptions', label: 'Subscriptions', icon: Repeat, group: 'E-commerce & finance' },
  { key: 'revenue', label: 'Revenue', icon: TrendingUp, group: 'E-commerce & finance' },
  { key: 'finance', label: 'Finance', icon: Wallet, group: 'E-commerce & finance' },
  { key: 'exchange-rates', label: 'Exchange rates', icon: Coins, group: 'E-commerce & finance' },
  { key: 'ad-spend', label: 'Ad spend', icon: BadgeDollarSign, group: 'Marketing & ads' },
  { key: 'campaigns', label: 'Campaigns', icon: Target, group: 'Marketing & ads' },
  { key: 'creatives', label: 'Creatives', icon: Image, group: 'Marketing & ads' },
  { key: 'video', label: 'Video', icon: Video, group: 'Marketing & ads' },
  { key: 'traffic-sources', label: 'Traffic sources', icon: Megaphone, group: 'Marketing & ads' },
  { key: 'keywords', label: 'Keywords', icon: Search, group: 'Marketing & ads' },
  { key: 'websites', label: 'Websites', icon: Globe, group: 'Marketing & ads' },
  { key: 'landing-pages', label: 'Landing pages', icon: LayoutTemplate, group: 'Marketing & ads' },
  { key: 'content', label: 'Content', icon: Newspaper, group: 'Marketing & ads' },
  { key: 'email', label: 'Email', icon: Mail, group: 'Marketing & ads' },
  { key: 'social', label: 'Social', icon: MessageCircle, group: 'Marketing & ads' },
  { key: 'customers', label: 'Customers', icon: Users, group: 'Customers & sales' },
  { key: 'users', label: 'Users', icon: User, group: 'Customers & sales' },
  { key: 'leads', label: 'Leads', icon: UserPlus, group: 'Customers & sales' },
  { key: 'companies', label: 'Companies', icon: Building2, group: 'Customers & sales' },
  { key: 'deals', label: 'Deals', icon: Handshake, group: 'Customers & sales' },
  { key: 'calls', label: 'Calls', icon: Phone, group: 'Customers & sales' },
  { key: 'reviews', label: 'Reviews', icon: Star, group: 'Customers & sales' },
  { key: 'support', label: 'Support', icon: LifeBuoy, group: 'Customers & sales' },
  { key: 'countries', label: 'Countries', icon: MapPin, group: 'Customers & sales' },
  { key: 'sessions', label: 'Sessions', icon: MousePointerClick, group: 'Behavior & analytics' },
  { key: 'pageviews', label: 'Pageviews', icon: Eye, group: 'Behavior & analytics' },
  { key: 'events', label: 'Events', icon: Activity, group: 'Behavior & analytics' },
  { key: 'conversions', label: 'Conversions', icon: Flag, group: 'Behavior & analytics' },
  { key: 'devices', label: 'Devices', icon: Smartphone, group: 'Behavior & analytics' },
  { key: 'funnels', label: 'Funnels', icon: Filter, group: 'Behavior & analytics' },
  { key: 'segments', label: 'Segments', icon: ChartPie, group: 'Behavior & analytics' },
  { key: 'experiments', label: 'Experiments', icon: FlaskConical, group: 'Behavior & analytics' },
  { key: 'kpis', label: 'KPIs', icon: Gauge, group: 'Behavior & analytics' },
  {
    key: 'forecasts',
    label: 'Forecasts',
    icon: ChartNoAxesCombined,
    group: 'Behavior & analytics',
  },
  { key: 'calendar', label: 'Calendar', icon: Calendar, group: 'General' },
  { key: 'database', label: 'Database', icon: Database, group: 'General' },
  { key: 'table', label: 'Table', icon: Table, group: 'General' },
] as const satisfies readonly {
  key: DataMartIconKey;
  label: string;
  icon: LucideIcon;
  group: DataMartIconGroup;
}[];

/** Shown when a Data Mart has no icon picked. */
export const DEFAULT_DATA_MART_ICON: LucideIcon = Box;

const ICONS_BY_KEY = new Map<string, LucideIcon>(
  DATA_MART_ICON_OPTIONS.map(option => [option.key, option.icon])
);

/** The icon to draw for a Data Mart; unknown or missing keys fall back to the default. */
export function getDataMartIcon(key: string | null | undefined): LucideIcon {
  return (key ? ICONS_BY_KEY.get(key) : undefined) ?? DEFAULT_DATA_MART_ICON;
}
