/**
 * Product-owned operational vocabulary.
 *
 * Restaurants select from this catalogue and persist the stable key alongside
 * their own editable label. A null catalogue key always means a custom item.
 * Keys are intentionally language-neutral and must never be reused.
 */

export type WorkspaceAreaCategory = 'guest' | 'production' | 'support';
export type WorkspacePositionCategory =
  | 'management'
  | 'service'
  | 'bar'
  | 'kitchen'
  | 'takeaway'
  | 'support';

export type WorkspaceAreaCatalogueItem = {
  key: string;
  label: string;
  category: WorkspaceAreaCategory;
  color: string;
  icon: string;
  reservable: boolean;
  starter: boolean;
};

export type WorkspacePositionCatalogueItem = {
  key: string;
  label: string;
  category: WorkspacePositionCategory;
  areaKeys: readonly string[];
  starter: boolean;
};

export const WORKSPACE_AREA_CATALOGUE = [
  { key: 'dining_room', label: 'Dining room', category: 'guest', color: '#b45309', icon: 'dining', reservable: true, starter: true },
  { key: 'bar', label: 'Bar', category: 'guest', color: '#0369a1', icon: 'bar', reservable: true, starter: true },
  { key: 'terrace', label: 'Terrace', category: 'guest', color: '#15803d', icon: 'terrace', reservable: true, starter: false },
  { key: 'reception', label: 'Reception', category: 'guest', color: '#7c3aed', icon: 'reception', reservable: false, starter: false },
  { key: 'private_room', label: 'Private room', category: 'guest', color: '#be185d', icon: 'private-room', reservable: true, starter: false },
  { key: 'counter', label: 'Counter', category: 'guest', color: '#0f766e', icon: 'counter', reservable: true, starter: false },
  { key: 'lounge', label: 'Lounge', category: 'guest', color: '#6d28d9', icon: 'lounge', reservable: true, starter: false },
  { key: 'event_space', label: 'Event space', category: 'guest', color: '#a21caf', icon: 'event', reservable: true, starter: false },
  { key: 'takeaway', label: 'Takeaway', category: 'guest', color: '#c2410c', icon: 'takeaway', reservable: false, starter: false },
  { key: 'drive_through', label: 'Drive-through', category: 'guest', color: '#a16207', icon: 'drive-through', reservable: false, starter: false },
  { key: 'kitchen', label: 'Kitchen', category: 'production', color: '#9f1239', icon: 'kitchen', reservable: false, starter: true },
  { key: 'hot_kitchen', label: 'Hot kitchen', category: 'production', color: '#b91c1c', icon: 'hot-kitchen', reservable: false, starter: false },
  { key: 'cold_kitchen', label: 'Cold kitchen', category: 'production', color: '#0e7490', icon: 'cold-kitchen', reservable: false, starter: false },
  { key: 'prep_kitchen', label: 'Preparation', category: 'production', color: '#c026d3', icon: 'preparation', reservable: false, starter: false },
  { key: 'pastry', label: 'Pastry', category: 'production', color: '#db2777', icon: 'pastry', reservable: false, starter: false },
  { key: 'bakery', label: 'Bakery', category: 'production', color: '#92400e', icon: 'bakery', reservable: false, starter: false },
  { key: 'dishwashing', label: 'Dishwashing', category: 'production', color: '#0f766e', icon: 'dishwashing', reservable: false, starter: true },
  { key: 'cellar', label: 'Cellar', category: 'production', color: '#7e22ce', icon: 'cellar', reservable: false, starter: false },
  { key: 'storage', label: 'Storage', category: 'support', color: '#475569', icon: 'storage', reservable: false, starter: false },
  { key: 'receiving', label: 'Receiving', category: 'support', color: '#4d7c0f', icon: 'receiving', reservable: false, starter: false },
  { key: 'delivery', label: 'Delivery', category: 'support', color: '#1d4ed8', icon: 'delivery', reservable: false, starter: false },
  { key: 'office', label: 'Office', category: 'support', color: '#334155', icon: 'office', reservable: false, starter: false },
  { key: 'staff_room', label: 'Staff room', category: 'support', color: '#64748b', icon: 'staff-room', reservable: false, starter: false },
  { key: 'cloakroom', label: 'Cloakroom', category: 'support', color: '#4338ca', icon: 'cloakroom', reservable: false, starter: false },
  { key: 'outdoor', label: 'Outdoor area', category: 'support', color: '#166534', icon: 'outdoor', reservable: false, starter: false }
] as const satisfies readonly WorkspaceAreaCatalogueItem[];

export const WORKSPACE_POSITION_CATALOGUE = [
  { key: 'restaurant_manager', label: 'Restaurant manager', category: 'management', areaKeys: [], starter: true },
  { key: 'assistant_manager', label: 'Assistant manager', category: 'management', areaKeys: [], starter: false },
  { key: 'shift_manager', label: 'Shift manager', category: 'management', areaKeys: [], starter: false },
  { key: 'maitre_d', label: "Maître d'", category: 'service', areaKeys: ['reception', 'dining_room'], starter: false },
  { key: 'host', label: 'Host', category: 'service', areaKeys: ['reception', 'dining_room'], starter: false },
  { key: 'head_waiter', label: 'Head waiter', category: 'service', areaKeys: ['dining_room', 'private_room', 'terrace'], starter: false },
  { key: 'waiter', label: 'Waiter', category: 'service', areaKeys: ['dining_room', 'terrace', 'private_room', 'lounge'], starter: true },
  { key: 'runner', label: 'Runner', category: 'service', areaKeys: ['dining_room', 'terrace', 'private_room'], starter: false },
  { key: 'sommelier', label: 'Sommelier', category: 'service', areaKeys: ['dining_room', 'private_room', 'cellar'], starter: false },
  { key: 'cloakroom_attendant', label: 'Cloakroom attendant', category: 'service', areaKeys: ['cloakroom', 'reception'], starter: false },
  { key: 'bar_manager', label: 'Bar manager', category: 'bar', areaKeys: ['bar'], starter: false },
  { key: 'bartender', label: 'Bartender', category: 'bar', areaKeys: ['bar'], starter: true },
  { key: 'barback', label: 'Barback', category: 'bar', areaKeys: ['bar'], starter: false },
  { key: 'barista', label: 'Barista', category: 'bar', areaKeys: ['bar', 'counter'], starter: false },
  { key: 'executive_chef', label: 'Executive chef', category: 'kitchen', areaKeys: ['kitchen'], starter: false },
  { key: 'head_chef', label: 'Head chef', category: 'kitchen', areaKeys: ['kitchen', 'hot_kitchen', 'cold_kitchen'], starter: false },
  { key: 'sous_chef', label: 'Sous-chef', category: 'kitchen', areaKeys: ['kitchen', 'hot_kitchen', 'cold_kitchen'], starter: false },
  { key: 'chef_de_partie', label: 'Chef de partie', category: 'kitchen', areaKeys: ['hot_kitchen', 'cold_kitchen', 'kitchen'], starter: false },
  { key: 'cook', label: 'Cook', category: 'kitchen', areaKeys: ['kitchen', 'hot_kitchen', 'cold_kitchen'], starter: true },
  { key: 'commis', label: 'Commis', category: 'kitchen', areaKeys: ['kitchen', 'prep_kitchen'], starter: false },
  { key: 'prep_cook', label: 'Prep cook', category: 'kitchen', areaKeys: ['prep_kitchen', 'kitchen'], starter: false },
  { key: 'pastry_chef', label: 'Pastry chef', category: 'kitchen', areaKeys: ['pastry'], starter: false },
  { key: 'baker', label: 'Baker', category: 'kitchen', areaKeys: ['bakery'], starter: false },
  { key: 'kitchen_porter', label: 'Kitchen porter', category: 'kitchen', areaKeys: ['kitchen', 'dishwashing'], starter: false },
  { key: 'dishwasher', label: 'Dishwasher', category: 'kitchen', areaKeys: ['dishwashing'], starter: true },
  { key: 'counter_attendant', label: 'Counter attendant', category: 'takeaway', areaKeys: ['counter', 'takeaway'], starter: false },
  { key: 'order_packer', label: 'Order packer', category: 'takeaway', areaKeys: ['takeaway', 'delivery'], starter: false },
  { key: 'delivery_coordinator', label: 'Delivery coordinator', category: 'takeaway', areaKeys: ['delivery', 'takeaway'], starter: false },
  { key: 'delivery_driver', label: 'Delivery driver', category: 'takeaway', areaKeys: ['delivery'], starter: false },
  { key: 'event_staff', label: 'Event staff', category: 'service', areaKeys: ['event_space'], starter: false },
  { key: 'stock_keeper', label: 'Stock keeper', category: 'support', areaKeys: ['storage', 'receiving', 'cellar'], starter: false },
  { key: 'cleaner', label: 'Cleaner', category: 'support', areaKeys: [], starter: false },
  { key: 'maintenance', label: 'Maintenance', category: 'support', areaKeys: [], starter: false },
  { key: 'all_rounder', label: 'All-round team member', category: 'support', areaKeys: [], starter: false },
  { key: 'trainee', label: 'Trainee', category: 'support', areaKeys: [], starter: false }
] as const satisfies readonly WorkspacePositionCatalogueItem[];

export const workspaceAreaByKey: ReadonlyMap<string, WorkspaceAreaCatalogueItem> = new Map(
  WORKSPACE_AREA_CATALOGUE.map((item) => [item.key, item])
);

export const workspacePositionByKey: ReadonlyMap<string, WorkspacePositionCatalogueItem> = new Map(
  WORKSPACE_POSITION_CATALOGUE.map((item) => [item.key, item])
);

export function starterWorkspaceAreas(): WorkspaceAreaCatalogueItem[] {
  return WORKSPACE_AREA_CATALOGUE.filter((item) => item.starter);
}

export function starterWorkspacePositions(
  areaKeys: Iterable<string>
): WorkspacePositionCatalogueItem[] {
  const available = new Set(areaKeys);
  return WORKSPACE_POSITION_CATALOGUE.filter(
    (item) =>
      item.starter &&
      (item.areaKeys.length === 0 || item.areaKeys.some((key) => available.has(key)))
  );
}

export function catalogueAreaColor(key: string | null | undefined): string | null {
  return key ? workspaceAreaByKey.get(key)?.color ?? null : null;
}
