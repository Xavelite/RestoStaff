-- restogogo Bouillon Bruxelles seed for relational schema v1
-- Source: Bouillon pilot setup data
-- Run after docs/sql/restogogo_supabase_schema_v1.sql.
-- Safe to rerun: replaces Bouillon pilot master/setup data with the Bouillon pilot setup.
-- PIN policy for this prototype seed: every employee receives PIN 0000.

begin;

insert into public.restogogo_restaurants (
  id, name, owner_name, city, legal_name, address, active_week_start, workspace_initialized,
  settings, payroll_rules
) values (
  'bouillon-bruxelles', 'Bouillon Bruxelles', 'Manager', 'Brussels',
  'Bouillon Bruxelles', 'Brussels', date_trunc('week', current_date + interval '7 days')::date, true,
  '{"schemaVersion":38,"notifications":[]}'::jsonb,
  '{"provider":"","exportFormat":"","costCenter":"","missingSettings":[]}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  owner_name = excluded.owner_name,
  city = excluded.city,
  legal_name = excluded.legal_name,
  address = excluded.address,
  active_week_start = coalesce(public.restogogo_restaurants.active_week_start, excluded.active_week_start),
  workspace_initialized = true,
  settings = excluded.settings,
  payroll_rules = excluded.payroll_rules;

-- Replace old dummy/demo Bouillon operational data if it was already seeded.
delete from public.restogogo_weekly_status where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_employee_absences where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_employees where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_opening_hours where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_zone_coverage_requirements where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_zones where restaurant_id = 'bouillon-bruxelles';
delete from public.restogogo_positions where restaurant_id = 'bouillon-bruxelles';

insert into public.restogogo_positions (
  restaurant_id, id, name, active, hourly_cost, sort_order
) values
  ('bouillon-bruxelles','maitre-d-hotel','Maitre d''hotel',true,18.00,1),
  ('bouillon-bruxelles','chef-de-rang','Chef de Rang',true,16.00,2),
  ('bouillon-bruxelles','barman','Barman',true,15.00,3),
  ('bouillon-bruxelles','runner','Runner',true,0.00,4),
  ('bouillon-bruxelles','extra-flexi-student','Extra (flexi / student)',true,13.50,5);

insert into public.restogogo_zones (
  restaurant_id, id, name, active, default_times, notes, sort_order, metadata
) values
  ('bouillon-bruxelles','ac','AC',true,'{"Lunch":"11:00-15:00","Evening":"17:00-00:00"}'::jsonb,'Accueil / reception slot from the Bouillon pilot setup.',1,'{"sourceRole":"Accueil"}'::jsonb),
  ('bouillon-bruxelles','dom-1','DOM 1',true,'{"Lunch":"11:00-15:00","Evening":"17:50-23:00"}'::jsonb,'',2,'{"sourceRole":"Chef de Rang"}'::jsonb),
  ('bouillon-bruxelles','dom-2','DOM 2',true,'{"Lunch":"12:00-16:00","Evening":"18:50-00:00"}'::jsonb,'',3,'{"sourceRole":"Chef de Rang"}'::jsonb),
  ('bouillon-bruxelles','ilot-1','ILOT 1',true,'{"Lunch":"11:00-15:00","Evening":"17:50-23:00"}'::jsonb,'',4,'{"sourceRole":"Chef de Rang"}'::jsonb),
  ('bouillon-bruxelles','ilot-2','ILOT 2',true,'{"Lunch":"12:00-16:00","Evening":"18:50-00:00"}'::jsonb,'',5,'{"sourceRole":"Chef de Rang"}'::jsonb),
  ('bouillon-bruxelles','bouil-1','BOUIL 1',true,'{"Lunch":"11:00-15:00","Evening":"17:50-23:00"}'::jsonb,'',6,'{"sourceRole":"Chef de Rang"}'::jsonb),
  ('bouillon-bruxelles','sch-1','SCH 1',true,'{"Lunch":"11:00-15:00","Evening":"17:50-23:00"}'::jsonb,'',7,'{"sourceRole":"Chef de Rang"}'::jsonb),
  ('bouillon-bruxelles','sch-2','SCH 2',true,'{"Lunch":"12:00-16:00","Evening":"18:50-00:00"}'::jsonb,'',8,'{"sourceRole":"Chef de Rang"}'::jsonb),
  ('bouillon-bruxelles','pass-1','PASS 1',true,'{"Lunch":"12:00-16:00","Evening":"17:50-23:00"}'::jsonb,'',9,'{"sourceRole":"Runner"}'::jsonb),
  ('bouillon-bruxelles','pass-b-1','PASS B 1',true,'{"Lunch":"12:00-16:00","Evening":"17:50-23:00"}'::jsonb,'',10,'{"sourceRole":"Runner"}'::jsonb),
  ('bouillon-bruxelles','bar-1','BAR 1',true,'{"Lunch":"11:00-15:00","Evening":"17:00-00:00"}'::jsonb,'',11,'{"sourceRole":"Barman"}'::jsonb),
  ('bouillon-bruxelles','bar-et','BAR ET',true,'{"Lunch":"12:00-16:00","Evening":"18:00-00:00"}'::jsonb,'',12,'{"sourceRole":"Barman"}'::jsonb);


insert into public.restogogo_zone_coverage_requirements (
  restaurant_id, zone_id, service_key, position_id, required_count, sort_order
) values
  ('bouillon-bruxelles','ac','Lunch','maitre-d-hotel',1,1),
  ('bouillon-bruxelles','ac','Evening','maitre-d-hotel',1,2),
  ('bouillon-bruxelles','dom-1','Lunch','chef-de-rang',1,11),
  ('bouillon-bruxelles','dom-1','Evening','chef-de-rang',1,12),
  ('bouillon-bruxelles','dom-2','Lunch','chef-de-rang',1,21),
  ('bouillon-bruxelles','dom-2','Evening','chef-de-rang',1,22),
  ('bouillon-bruxelles','ilot-1','Lunch','chef-de-rang',1,31),
  ('bouillon-bruxelles','ilot-1','Evening','chef-de-rang',1,32),
  ('bouillon-bruxelles','ilot-2','Lunch','chef-de-rang',1,41),
  ('bouillon-bruxelles','ilot-2','Evening','chef-de-rang',1,42),
  ('bouillon-bruxelles','bouil-1','Lunch','chef-de-rang',1,51),
  ('bouillon-bruxelles','bouil-1','Evening','chef-de-rang',1,52),
  ('bouillon-bruxelles','sch-1','Lunch','chef-de-rang',1,61),
  ('bouillon-bruxelles','sch-1','Evening','chef-de-rang',1,62),
  ('bouillon-bruxelles','sch-2','Lunch','chef-de-rang',1,71),
  ('bouillon-bruxelles','sch-2','Evening','chef-de-rang',1,72),
  ('bouillon-bruxelles','pass-1','Lunch','runner',1,81),
  ('bouillon-bruxelles','pass-1','Evening','runner',1,82),
  ('bouillon-bruxelles','pass-b-1','Lunch','runner',1,91),
  ('bouillon-bruxelles','pass-b-1','Evening','runner',1,92),
  ('bouillon-bruxelles','bar-1','Lunch','barman',1,101),
  ('bouillon-bruxelles','bar-1','Evening','barman',1,102),
  ('bouillon-bruxelles','bar-et','Lunch','barman',1,111),
  ('bouillon-bruxelles','bar-et','Evening','barman',1,112)
on conflict (restaurant_id, zone_id, service_key, position_id) do update set
  required_count = excluded.required_count,
  sort_order = excluded.sort_order;

-- The original pilot setup stored slot-level times rather than day-specific restaurant hours.
-- These broad 7/7 opening ranges are derived from the earliest/latest pilot slots.
insert into public.restogogo_opening_hours (restaurant_id, day_name, is_open, lunch_range, evening_range, sort_order) values
  ('bouillon-bruxelles','Monday',true,'11:00-16:00','17:00-00:00',1),
  ('bouillon-bruxelles','Tuesday',true,'11:00-16:00','17:00-00:00',2),
  ('bouillon-bruxelles','Wednesday',true,'11:00-16:00','17:00-00:00',3),
  ('bouillon-bruxelles','Thursday',true,'11:00-16:00','17:00-00:00',4),
  ('bouillon-bruxelles','Friday',true,'11:00-16:00','17:00-00:00',5),
  ('bouillon-bruxelles','Saturday',true,'11:00-16:00','17:00-00:00',6),
  ('bouillon-bruxelles','Sunday',true,'11:00-16:00','17:00-00:00',7);

insert into public.restogogo_employees (
  restaurant_id, id, name, position_id, active, manager_access, pin_code,
  payroll_id, employee_number, email, phone, contract_type, contract_hours, hourly_cost, payroll_ready, sort_order
) values
  ('bouillon-bruxelles','dimitri','Dimitri','maitre-d-hotel',true,false,'0000','','','','','',0,18.00,false,1),
  ('bouillon-bruxelles','iymane','Iymane','barman',true,false,'0000','','','','','',0,15.00,false,2),
  ('bouillon-bruxelles','anxhelo','Anxhelo','barman',true,false,'0000','','','','','',0,15.00,false,3),
  ('bouillon-bruxelles','arben','Arben','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,4),
  ('bouillon-bruxelles','metin','Metin','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,5),
  ('bouillon-bruxelles','khadija','Khadija','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,6),
  ('bouillon-bruxelles','laundry','Laundry','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,7),
  ('bouillon-bruxelles','joel','Joel','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,8),
  ('bouillon-bruxelles','pedro','Pedro','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,9),
  ('bouillon-bruxelles','radhi','Radhi','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,10),
  ('bouillon-bruxelles','hakim','Hakim','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,11),
  ('bouillon-bruxelles','carl','Carl','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,12),
  ('bouillon-bruxelles','candy','Candy','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,13),
  ('bouillon-bruxelles','eva','Eva','chef-de-rang',true,false,'0000','','','','','',0,16.00,false,14),
  ('bouillon-bruxelles','lea','Lea','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,15),
  ('bouillon-bruxelles','anais','Anais','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,16),
  ('bouillon-bruxelles','chloe','Chloe','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,17),
  ('bouillon-bruxelles','yassin','Yassin','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,18),
  ('bouillon-bruxelles','sam','Sam','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,19),
  ('bouillon-bruxelles','loic','Loic','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,20),
  ('bouillon-bruxelles','frantzchini','Frantzchini','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,21),
  ('bouillon-bruxelles','sophie','Sophie','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,22),
  ('bouillon-bruxelles','laura','Laura','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,23),
  ('bouillon-bruxelles','jetmir','Jetmir','extra-flexi-student',true,false,'0000','','','','','',0,13.50,false,24);

commit;
