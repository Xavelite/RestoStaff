-- restogogo Bouillon Bruxelles seed for relational schema v1
-- Source: restogogo_v295_v2-stabilization-checkpoint.zip
-- Run after docs/sql/restogogo_supabase_schema_v1.sql.
-- Safe to rerun: replaces Bouillon pilot master/setup data with the v295 setup.
-- PIN policy for this prototype seed: every employee receives PIN 0000.

begin;

insert into public.restogogo_restaurants (
  id, name, owner_name, city, accent_color, theme, legal_name, address, active_week_start, workspace_initialized,
  settings, payroll_rules, ui_preferences
) values (
  'bouillon-bruxelles', 'Bouillon Bruxelles', 'Manager', 'Brussels', '#9b1734', 'modern-dark',
  'Bouillon Bruxelles', 'Brussels', date_trunc('week', current_date + interval '7 days')::date, true,
  '{"schemaVersion":25,"notifications":[]}'::jsonb,
  '{"provider":"","exportFormat":"","costCenter":"","missingSettings":[]}'::jsonb,
  '{"positionColors":{},"zoneColors":{}}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  owner_name = excluded.owner_name,
  city = excluded.city,
  accent_color = excluded.accent_color,
  theme = excluded.theme,
  legal_name = excluded.legal_name,
  address = excluded.address,
  active_week_start = coalesce(public.restogogo_restaurants.active_week_start, excluded.active_week_start),
  workspace_initialized = true,
  settings = excluded.settings,
  payroll_rules = excluded.payroll_rules,
  ui_preferences = excluded.ui_preferences;

-- Replace old dummy/demo Bouillon operational data if it was already seeded.
delete from public.restogogo_weekly_status where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_employee_absences where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_employee_documents where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_restaurant_documents where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_employees where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_opening_hours where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_zones where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_positions where restaurant_id = 'bouillon-bruxelles';

insert into public.restogogo_positions (
  restaurant_id, id, name, department, active, default_zone, hourly_cost, sort_order
) values
  ('bouillon-bruxelles','maitre-d-hotel','Maitre d''hotel','',true,'',18.00,1),
  ('bouillon-bruxelles','chef-de-rang','Chef de Rang','',true,'',16.00,2),
  ('bouillon-bruxelles','barman','Barman','',true,'',15.00,3),
  ('bouillon-bruxelles','runner','Runner','',true,'',0.00,4),
  ('bouillon-bruxelles','extra-flexi-student','Extra (flexi / student)','',true,'',13.50,5);

insert into public.restogogo_zones (
  restaurant_id, id, name, capacity, active, services, default_positions, notes, sort_order, metadata
) values
  ('bouillon-bruxelles','ac','AC',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Maitre d''hotel"]'::jsonb,'Accueil / reception slot from v295 setup.',1,'{"legacyRole":"Accueil","defaultTimes":{"Lunch":"11:00-15:00","Evening":"17:00-00:00"}}'::jsonb),
  ('bouillon-bruxelles','dom-1','DOM 1',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Chef de Rang"]'::jsonb,'',2,'{"legacyRole":"Chef de Rang","defaultTimes":{"Lunch":"11:00-15:00","Evening":"17:50-23:00"}}'::jsonb),
  ('bouillon-bruxelles','dom-2','DOM 2',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Chef de Rang"]'::jsonb,'',3,'{"legacyRole":"Chef de Rang","defaultTimes":{"Lunch":"12:00-16:00","Evening":"18:50-00:00"}}'::jsonb),
  ('bouillon-bruxelles','ilot-1','ILOT 1',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Chef de Rang"]'::jsonb,'',4,'{"legacyRole":"Chef de Rang","defaultTimes":{"Lunch":"11:00-15:00","Evening":"17:50-23:00"}}'::jsonb),
  ('bouillon-bruxelles','ilot-2','ILOT 2',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Chef de Rang"]'::jsonb,'',5,'{"legacyRole":"Chef de Rang","defaultTimes":{"Lunch":"12:00-16:00","Evening":"18:50-00:00"}}'::jsonb),
  ('bouillon-bruxelles','bouil-1','BOUIL 1',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Chef de Rang"]'::jsonb,'',6,'{"legacyRole":"Chef de Rang","defaultTimes":{"Lunch":"11:00-15:00","Evening":"17:50-23:00"}}'::jsonb),
  ('bouillon-bruxelles','sch-1','SCH 1',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Chef de Rang"]'::jsonb,'',7,'{"legacyRole":"Chef de Rang","defaultTimes":{"Lunch":"11:00-15:00","Evening":"17:50-23:00"}}'::jsonb),
  ('bouillon-bruxelles','sch-2','SCH 2',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Chef de Rang"]'::jsonb,'',8,'{"legacyRole":"Chef de Rang","defaultTimes":{"Lunch":"12:00-16:00","Evening":"18:50-00:00"}}'::jsonb),
  ('bouillon-bruxelles','pass-1','PASS 1',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Runner"]'::jsonb,'',9,'{"legacyRole":"Runner","defaultTimes":{"Lunch":"12:00-16:00","Evening":"17:50-23:00"}}'::jsonb),
  ('bouillon-bruxelles','pass-b-1','PASS B 1',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Runner"]'::jsonb,'',10,'{"legacyRole":"Runner","defaultTimes":{"Lunch":"12:00-16:00","Evening":"17:50-23:00"}}'::jsonb),
  ('bouillon-bruxelles','bar-1','BAR 1',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Barman"]'::jsonb,'',11,'{"legacyRole":"Barman","defaultTimes":{"Lunch":"11:00-15:00","Evening":"17:00-00:00"}}'::jsonb),
  ('bouillon-bruxelles','bar-et','BAR ET',0,true,'{"Lunch":true,"Evening":true}'::jsonb,'["Barman"]'::jsonb,'',12,'{"legacyRole":"Barman","defaultTimes":{"Lunch":"12:00-16:00","Evening":"18:00-00:00"}}'::jsonb);

-- v295 stored slot-level times rather than day-specific restaurant hours.
-- These broad 7/7 opening ranges are derived from the earliest/latest v295 slots.
insert into public.restogogo_opening_hours (restaurant_id, day_name, is_open, lunch_range, evening_range, sort_order) values
  ('bouillon-bruxelles','Monday',true,'11:00-16:00','17:00-00:00',1),
  ('bouillon-bruxelles','Tuesday',true,'11:00-16:00','17:00-00:00',2),
  ('bouillon-bruxelles','Wednesday',true,'11:00-16:00','17:00-00:00',3),
  ('bouillon-bruxelles','Thursday',true,'11:00-16:00','17:00-00:00',4),
  ('bouillon-bruxelles','Friday',true,'11:00-16:00','17:00-00:00',5),
  ('bouillon-bruxelles','Saturday',true,'11:00-16:00','17:00-00:00',6),
  ('bouillon-bruxelles','Sunday',true,'11:00-16:00','17:00-00:00',7);

insert into public.restogogo_employees (
  restaurant_id, id, name, position, rate, active, manager_access, pin_code,
  payroll_id, external_id, employee_number, email, phone, contract_type, contract_hours, hourly_cost, payroll_ready, sort_order
) values
  ('bouillon-bruxelles','dimitri','Dimitri','Maitre d''hotel',18.00,true,false,'0000','','','','','','',0,18.00,false,1),
  ('bouillon-bruxelles','iymane','Iymane','Barman',15.00,true,false,'0000','','','','','','',0,15.00,false,2),
  ('bouillon-bruxelles','anxhelo','Anxhelo','Barman',15.00,true,false,'0000','','','','','','',0,15.00,false,3),
  ('bouillon-bruxelles','arben','Arben','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,4),
  ('bouillon-bruxelles','metin','Metin','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,5),
  ('bouillon-bruxelles','khadija','Khadija','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,6),
  ('bouillon-bruxelles','laundry','Laundry','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,7),
  ('bouillon-bruxelles','joel','Joel','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,8),
  ('bouillon-bruxelles','pedro','Pedro','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,9),
  ('bouillon-bruxelles','radhi','Radhi','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,10),
  ('bouillon-bruxelles','hakim','Hakim','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,11),
  ('bouillon-bruxelles','carl','Carl','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,12),
  ('bouillon-bruxelles','candy','Candy','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,13),
  ('bouillon-bruxelles','eva','Eva','Chef de Rang',16.00,true,false,'0000','','','','','','',0,16.00,false,14),
  ('bouillon-bruxelles','lea','Lea','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,15),
  ('bouillon-bruxelles','anais','Anais','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,16),
  ('bouillon-bruxelles','chloe','Chloe','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,17),
  ('bouillon-bruxelles','yassin','Yassin','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,18),
  ('bouillon-bruxelles','sam','Sam','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,19),
  ('bouillon-bruxelles','loic','Loic','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,20),
  ('bouillon-bruxelles','frantzchini','Frantzchini','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,21),
  ('bouillon-bruxelles','sophie','Sophie','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,22),
  ('bouillon-bruxelles','laura','Laura','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,23),
  ('bouillon-bruxelles','jetmir','Jetmir','Extra (flexi / student)',13.50,true,false,'0000','','','','','','',0,13.50,false,24);

commit;
