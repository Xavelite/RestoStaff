/* restogogo brand helpers. Module accents live in CSS; employee identity stays neutral by default. */
function positionStyle(){return '--pos-color:var(--rst-ui-text);--pos-bg:var(--rst-ui-divider-soft);--pos-border:var(--rst-state-neutral-border);';}
function styleAttr(css){return css?` style="${css}"`:'';}
function positionClass(position=''){const p=String(position).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); if(p.includes('maitre')||p.includes('manager'))return 'pos-maitre'; if(p.includes('chef'))return 'pos-chef'; if(p.includes('barman')||p.includes('barmaid'))return 'pos-barman'; if(p.includes('extra')||p.includes('student')||p.includes('flexi'))return 'pos-extra'; return 'pos-other';}
