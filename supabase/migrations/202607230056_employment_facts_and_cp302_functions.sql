-- V576: make employment setup fact-driven and seed the official CP 302
-- reference-function subset used by restaurant pilots.
begin;

alter type public.employment_payroll_regime add value if not exists 'student' after 'flexi';

alter table public.cp302_reference_functions
  add column if not exists name_en text,
  add column if not exists department text,
  add column if not exists default_worker_status public.worker_status;

alter table public.employee_employment_terms
  add column if not exists employment_type_code text,
  add column if not exists worker_status_override_reason text,
  add column if not exists validation_blockers jsonb not null default '[]'::jsonb;

alter table public.employee_employment_terms
  drop constraint employee_employment_terms_source_status_check;
alter table public.employee_employment_terms
  add constraint employee_employment_terms_source_status_check
    check (source_status in ('recorded', 'complete', 'migrated_unverified', 'verified'));
alter table public.employee_employment_terms
  add constraint employee_employment_terms_validation_blockers_array
    check (jsonb_typeof(validation_blockers) = 'array');
alter table public.employee_employment_terms
  add constraint employee_employment_terms_employment_type_code_check
    check (employment_type_code is null or employment_type_code ~ '^[A-Z0-9_-]+$');

alter table public.employee_contracts
  add constraint employee_contracts_restaurant_employee_id_key
    unique (restaurant_id, employee_id, id);
alter table public.employee_employment_terms
  drop constraint employee_employment_terms_contract_fk;
alter table public.employee_employment_terms
  add constraint employee_employment_terms_contract_employee_fk
    foreign key (restaurant_id, employee_id, contract_id)
      references public.employee_contracts(restaurant_id, employee_id, id) on delete restrict;

insert into public.payroll_legal_sources (
  code, authority, title, url, published_on, retrieved_on, verification_notes
) values (
  'CP302_FUNCTION_CLASSIFICATION_2026',
  'FPS Employment',
  'CP 302 reference functions and worker-status classification',
  'https://emploi.belgique.be/sites/default/files/content/documents/International/Fiches%20Limosa/D%C3%A9tachement302.pdf',
  date '2026-01-21', date '2026-07-23',
  'Official CP 302 function codes, categories and the explicit list of functions with white-collar status. Pilot catalogue covers the restaurant, reception and common administration functions used by Restogogo.'
)
on conflict (code) do update set
  title = excluded.title,
  url = excluded.url,
  published_on = excluded.published_on,
  retrieved_on = excluded.retrieved_on,
  verification_notes = excluded.verification_notes;

with source as (
  select id from public.payroll_legal_sources where code = 'CP302_FUNCTION_CLASSIFICATION_2026'
), functions(code, name_en, name_fr, name_nl, department, category, worker_status) as (
  values
    ('102','Kitchen commis','Garçon/fille de cuisine, manœuvre de cuisine, commis','Keukenjongen/-meisje, keukenhulp, commis','kitchen',2,'blue_collar'::public.worker_status),
    ('104','Demi-chef de partie','Demi-chef de partie','Demi-chef de partie','kitchen',5,'blue_collar'::public.worker_status),
    ('105','Cold-section chef de partie','Chef de partie cuisine froide','Chef de partie koude keuken','kitchen',6,'blue_collar'::public.worker_status),
    ('106','Hot-section chef de partie','Chef de partie cuisine chaude','Chef de partie warme keuken','kitchen',6,'blue_collar'::public.worker_status),
    ('112','Sous-chef','Sous-chef','Onderchef keuken, sous-chef','kitchen',8,'blue_collar'::public.worker_status),
    ('113A','Cook / sole-working cook','Cuisinier(ère), cuisinier(ère) travaillant seul','Kok(in), kok(in) alleenwerkend','kitchen',8,'blue_collar'::public.worker_status),
    ('113B','Chef-manager','Chef gérant','Chef-gérant','kitchen',9,'blue_collar'::public.worker_status),
    ('113C','Assistant cook working alone','Aide-cuisinier travaillant seul','Hulp-kok alleenwerkend','kitchen',7,'blue_collar'::public.worker_status),
    ('114','Kitchen manager / head chef','Responsable de cuisine, chef de cuisine','Keukenverantwoordelijke, keukenchef','kitchen',9,'blue_collar'::public.worker_status),
    ('116A','Kitchen team member','Collaborateur(trice) cuisine','Medewerk(st)er keuken','kitchen',3,'blue_collar'::public.worker_status),
    ('116B','Quick-service crew','Commis de service rapide (crew)','Medewerk(st)er sneldienstrestauratie (crew)','kitchen',4,'blue_collar'::public.worker_status),
    ('116C','Pizza cook','Collaborateur(trice) cuisine - cuit les pizzas','Medewerk(st)er keuken - pizzabakker(in)','kitchen',3,'blue_collar'::public.worker_status),
    ('116D','Quick-service kitchen / grill crew','Collaborateur(trice) service rapide - cuisine/grill - équipier','Medewerk(st)er sneldienstrestauratie-keuken/grill - crew','kitchen',3,'blue_collar'::public.worker_status),
    ('117A','Quick-service crew leader','Chef de brigade service rapide (crew leader)','Ploegverantwoordelijke (crew leader)','kitchen',5,'blue_collar'::public.worker_status),
    ('117B','Quick-service shift leader','Chef d''équipe service rapide (shift leader)','Ploegverantwoordelijke (shift leader)','kitchen',5,'blue_collar'::public.worker_status),
    ('118','Production manager','Responsable de production','Verantwoordelijke productie','kitchen',8,'white_collar'::public.worker_status),
    ('121','Counter / grill cook','Cuisinier-comptoir, rôtisseur, préposé(e) au grill','Toonbank-kok, rotisseur, aangestelde grill','kitchen',4,'blue_collar'::public.worker_status),
    ('122','Catering cook','Cuisinier(ère) - service traiteur','Kok(in) - traiteurdienst','kitchen',6,'blue_collar'::public.worker_status),
    ('123','Fryer cook','Friturier(ère)','Frituurbakker(in)','kitchen',3,'blue_collar'::public.worker_status),
    ('124','Office kitchen assistant','Collaborateur(trice) d''office','Medewerk(st)er office','kitchen',1,'blue_collar'::public.worker_status),
    ('125','Snack-bar team member','Collaborateur(trice) snack-bar','Medewerk(st)er snackbar','kitchen',2,'blue_collar'::public.worker_status),
    ('126','Dishwasher / sole-working dishwasher','Collaborateur(trice) plonge, plongeur(euse) travaillant seul','Medewerk(st)er spoelkeuken, bordenwass(t)er alleenwerkend','kitchen',3,'blue_collar'::public.worker_status),
    ('128','Dishwashing team leader','Chef d''équipe plongeurs, assistant(e) responsable plonge','Ploegverantwoordelijke bordenwassers, assistent verantwoordelijke spoelkeuken','kitchen',5,'blue_collar'::public.worker_status),
    ('129','Dishwashing manager','Responsable de plonge, chef-plongeur','Verantwoordelijke spoelkeuken','kitchen',8,'blue_collar'::public.worker_status),
    ('130','Butcher','Boucher','Slager','kitchen',6,'blue_collar'::public.worker_status),
    ('202-205','Service commis','Commis','Hulpkelner(in), commis','service',2,'blue_collar'::public.worker_status),
    ('206A','Classic restaurant waiter','Garçon/serveuse restaurant','Kelner(in) klassiek restaurant','service',5,'blue_collar'::public.worker_status),
    ('206B','Brasserie / bistro waiter','Garçon/serveuse brasserie, taverne, bistrot','Kelner(in) brasserie, taverne, bistro','service',5,'blue_collar'::public.worker_status),
    ('206C','Café waiter','Garçon/serveuse café','Kelner(in) café','service',4,'blue_collar'::public.worker_status),
    ('207','Demi chef de rang','1/2 chef de rang','1/2 rijleid(st)er','service',5,'blue_collar'::public.worker_status),
    ('208','Chef de rang','Chef de rang','Rangkelner(in), rijleid(st)er','service',5,'blue_collar'::public.worker_status),
    ('209','Senior chef de rang / captain','Premier chef de rang, capitaine','Eerste rangkelner(in), verantwoordelijke kelners','service',6,'blue_collar'::public.worker_status),
    ('210','Sommelier','Sommelier','Wijnkelner(in), sommelier','service',6,'blue_collar'::public.worker_status),
    ('211A','Assistant maître d''hôtel','Assistant(e) maître d''hôtel','Assistent(e) oberkelner, assistent(e) maître d''hôtel','service',8,'blue_collar'::public.worker_status),
    ('211B','Maître d''hôtel / floor manager','Maître d''hôtel, responsable de salle','Oberkelner(in), maître d''hôtel','service',9,'blue_collar'::public.worker_status),
    ('212','Bar commis','Aide-barman/barmaid, commis barman/barmaid','Hulp-barman/barmeid, commis barman','service',2,'blue_collar'::public.worker_status),
    ('213','Bartender','Barman/barmaid','Barman, barkeeper, barmeisje','service',6,'blue_collar'::public.worker_status),
    ('214','Head bartender','Chef de bar, chef barman/barmaid','Verantwoordelijke barman/barmeisje','service',6,'blue_collar'::public.worker_status),
    ('216','Drinks-counter attendant','Employé au comptoir boissons, buffetier(ère)','Tapkastbedien(st)er, buffetbediende','service',4,'blue_collar'::public.worker_status),
    ('217A','Self-service team member','Collaborateur(trice) au self-service','Medewerk(st)er self-service','service',2,'blue_collar'::public.worker_status),
    ('217B','Counter server','Serveur(euse) au comptoir','Toonbankbediende (bedienen)','service',3,'blue_collar'::public.worker_status),
    ('217C','Counter server - heat and serve','Serveur(euse) au comptoir (chauffer et servir)','Toonbankbediende (opwarmen en bedienen)','service',3,'blue_collar'::public.worker_status),
    ('217D','Counter server - prepare and serve','Serveur(euse) au comptoir (préparer et servir)','Toonbankbediende (bereiden en bedienen)','service',4,'blue_collar'::public.worker_status),
    ('217E','Counter server - prepare, serve and cashier','Serveur(euse) au comptoir (préparer, servir et caisse)','Toonbankbediende (bereiden, bedienen, kassa)','service',5,'blue_collar'::public.worker_status),
    ('217F','Quick-service front crew','Collaborateur(trice) service rapide - accueil/salle - équipier','Medewerk(st)er sneldienstrestauratie-onthaal/zaal-crew','service',3,'blue_collar'::public.worker_status),
    ('218','Host / hostess','Accueil, hôte(sse) d''accueil','Onthaal, hostess','service',3,'blue_collar'::public.worker_status),
    ('220','Cashier','Caissier(ère)','Kassier(ster)','service',4,'white_collar'::public.worker_status),
    ('221','Assistant cashier','Aide-caissier(ère)','Hulp-kassier(ster)','service',3,'blue_collar'::public.worker_status),
    ('222-223','Self-service sales-point manager','Responsable d''un point de vente cafétaria/self-service','Verantwoordelijke verkooppunt self-service cafetaria','service',9,'white_collar'::public.worker_status),
    ('224','Table clearer','Débarrasseur','Afruim(st)er','service',1,'blue_collar'::public.worker_status),
    ('226C','Assistant dietician','Aide-diététicien(ne)','Assistent-diëtist(e)','service',5,'blue_collar'::public.worker_status),
    ('228A','Goods-transport driver','Chauffeur transport de marchandises','Chauffeur goederentransport','service',5,'blue_collar'::public.worker_status),
    ('228B','Passenger-transport driver','Chauffeur transport de personnes','Chauffeur personentransport','service',5,'blue_collar'::public.worker_status),
    ('230','Shop salesperson','Vendeur(euse), collaborateur(trice) magasin','Verko(o)p(st)er, medewerk(st)er winkel','service',5,'white_collar'::public.worker_status),
    ('234','Breakfast-buffet team member','Collaborateur(trice) buffet déjeuner','Medewerk(st)er ontbijt(buffet)','service',3,'blue_collar'::public.worker_status),
    ('235','Banquet commis','Aide-serveur(euse), commis','Hulpkelner(in), commis','service',2,'blue_collar'::public.worker_status),
    ('241','Banquet waiter','Garçon/fille banquet','Banketkelner(in)','service',3,'blue_collar'::public.worker_status),
    ('242','Prepared-food delivery worker','Livreur à domicile de plats préparés','Besteller aan huis van bereide gerechten','service',2,'blue_collar'::public.worker_status),
    ('306','Receptionist / guest-service agent','Réceptionniste, préposé(e) service clientèle, chef de réception adjoint','Receptionist(e), guestservice agent, shift-leader','front_office',6,'white_collar'::public.worker_status),
    ('307','Head of reception','Responsable de réception, chef des réceptionnistes','Verantwoordelijke receptie, receptiechef','front_office',7,'white_collar'::public.worker_status),
    ('309','Reservations employee','Employé(e) de réservations','Reservatiebediende','front_office',5,'white_collar'::public.worker_status),
    ('310','Reservations manager','Responsable des réservations','Verantwoordelijke reservaties','front_office',7,'white_collar'::public.worker_status),
    ('311','Front-office cashier','Caissier(ère), main-courantier(ère)','Kassabediende, front-office cashier','front_office',5,'white_collar'::public.worker_status),
    ('313','Telephone operator','Téléphoniste, opérateur(trice)','Telefonist(e), operator','front_office',5,'white_collar'::public.worker_status),
    ('314','Chief telephone operator','Responsable du service téléphone, chef opérateur(trice)','Verantwoordelijke telefonisten, chief operator','front_office',6,'white_collar'::public.worker_status),
    ('316','Night receptionist','Réceptionniste de nuit','Nacht-receptionist(e)','front_office',6,'white_collar'::public.worker_status),
    ('317','Night watch','Veilleur(euse) de nuit','Nachtwa(a)k(st)er','front_office',6,'blue_collar'::public.worker_status),
    ('318A','Security agent','Agent de sécurité, surveillant(e)','Veiligheidsagent(e), bewa(a)k(st)er','front_office',6,'blue_collar'::public.worker_status),
    ('318B','Head of security','Chef de sécurité, surveillant(e)-chef','Veiligheidschef(fin), chef bewaking','front_office',8,'white_collar'::public.worker_status),
    ('801','Storekeeper','Magasinier(ère)','Magazijnier(ster)','administration',5,'blue_collar'::public.worker_status),
    ('802','Economist / stores controller','Econome','Econoom','administration',6,'white_collar'::public.worker_status),
    ('805','Restaurant manager','Restaurateur(trice) gérant, directeur(trice) des restaurants','Gerant, restaurantmanager','administration',9,'white_collar'::public.worker_status),
    ('806','Assistant manager','Assistant gérant','Assistent zaakvoerder','administration',8,'white_collar'::public.worker_status),
    ('817','Accounting employee','Employé(e) aux écritures comptables','Bediende boekhouding','administration',6,'white_collar'::public.worker_status),
    ('818','Chief accountant','(Chef) comptable','(Hoofd)boekhoud(st)er','administration',9,'white_collar'::public.worker_status),
    ('819','Payroll-administration employee','Collaborateur(trice) administration des salaires','Medewerk(st)er loonadministratie','administration',6,'white_collar'::public.worker_status),
    ('821','Night auditor','Night-auditor, comptable de nuit','Night-auditor, coördinator ontvangsten','administration',5,'white_collar'::public.worker_status),
    ('826B','Personnel-administration employee','Collaborateur(trice) administration du personnel','Medewerk(st)er personeelsadministratie','administration',6,'white_collar'::public.worker_status),
    ('828','Secretary','Secrétaire','Secretaresse, secretaris','administration',6,'white_collar'::public.worker_status)
)
insert into public.cp302_reference_functions (
  code, name_en, name_fr, name_nl, department, category,
  default_worker_status, valid_from, legal_source_id, status
)
select f.code, f.name_en, f.name_fr, f.name_nl, f.department, f.category,
  f.worker_status, date '2007-10-01', source.id, 'effective'
from functions f cross join source
on conflict (code, valid_from) do update set
  name_en = excluded.name_en,
  name_fr = excluded.name_fr,
  name_nl = excluded.name_nl,
  department = excluded.department,
  category = excluded.category,
  default_worker_status = excluded.default_worker_status,
  legal_source_id = excluded.legal_source_id,
  status = excluded.status;

update public.employee_employment_terms t
set employment_type_code = coalesce(nullif(upper(ct.code), ''), 'CUSTOM'),
    validation_blockers = case
      when t.source_status = 'verified' then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object(
        'code', 'V575_REVIEW_REQUIRED',
        'message', 'Review this V575 employment-term version through the fact-driven setup.'
      ))
    end
from public.employee_contracts c
left join public.contract_types ct
  on ct.restaurant_id = c.restaurant_id and ct.id = c.contract_type_id
where c.id = t.contract_id and c.restaurant_id = t.restaurant_id
  and t.employment_type_code is null;

comment on column public.employee_employment_terms.employment_type_code is
  'Recorded business employment type; normalized duration, regime, volume and legal schedule are server-derived.';
comment on column public.employee_employment_terms.worker_status_override_reason is
  'Exceptional owner justification when worker status differs from the effective CP 302 reference function.';

commit;
