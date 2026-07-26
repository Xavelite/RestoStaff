-- A profile may own many restaurants. Catalogue identity is unique only
-- inside one restaurant, while custom areas and positions remain unrestricted.

begin;

create index if not exists restaurants_owner_profile_id_idx
  on public.restaurants (owner_profile_id);

create unique index if not exists work_areas_restaurant_catalogue_key_idx
  on public.work_areas (restaurant_id, catalogue_key)
  where catalogue_key is not null;

create unique index if not exists job_functions_restaurant_catalogue_key_idx
  on public.job_functions (restaurant_id, catalogue_key)
  where catalogue_key is not null;

commit;
