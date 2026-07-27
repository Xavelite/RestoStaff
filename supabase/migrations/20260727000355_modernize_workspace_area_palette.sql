-- Refresh product-owned catalogue colours without overwriting an owner's
-- explicit custom colour. Only null values and the previous catalogue default
-- are migrated; future custom choices remain restaurant-specific.
with palette(catalogue_key, previous_color, next_color) as (
  values
    ('dining_room', '#b45309', '#f97316'),
    ('bar', '#0369a1', '#3b82f6'),
    ('terrace', '#15803d', '#10b981'),
    ('reception', '#7c3aed', '#8b5cf6'),
    ('private_room', '#be185d', '#ec4899'),
    ('counter', '#0f766e', '#06b6d4'),
    ('lounge', '#6d28d9', '#6366f1'),
    ('event_space', '#a21caf', '#d946ef'),
    ('takeaway', '#c2410c', '#f59e0b'),
    ('drive_through', '#a16207', '#84cc16'),
    ('kitchen', '#9f1239', '#f43f5e'),
    ('hot_kitchen', '#b91c1c', '#ef4444'),
    ('cold_kitchen', '#0e7490', '#0ea5e9'),
    ('prep_kitchen', '#c026d3', '#a855f7'),
    ('pastry', '#db2777', '#f472b6'),
    ('bakery', '#92400e', '#d97706'),
    ('dishwashing', '#0f766e', '#14b8a6'),
    ('cellar', '#7e22ce', '#7c3aed'),
    ('storage', '#475569', '#64748b'),
    ('receiving', '#4d7c0f', '#65a30d'),
    ('delivery', '#1d4ed8', '#2563eb'),
    ('office', '#334155', '#475569'),
    ('staff_room', '#64748b', '#78716c'),
    ('cloakroom', '#4338ca', '#4f46e5'),
    ('outdoor', '#166534', '#22c55e')
)
update public.work_areas as area
set
  color = palette.next_color,
  metadata = case
    when lower(coalesce(area.metadata ->> 'color', '')) = palette.previous_color
      then jsonb_set(coalesce(area.metadata, '{}'::jsonb), '{color}', to_jsonb(palette.next_color), true)
    else coalesce(area.metadata, '{}'::jsonb)
  end
from palette
where area.catalogue_key = palette.catalogue_key
  and (
    area.color is null
    or lower(area.color) = palette.previous_color
  );
