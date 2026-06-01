/* Shared absence domain logic: types, status order, date coverage, duration and display helpers. */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.logic = R.logic || {};

  const PLANNING_STATUS_ORDER = Object.freeze({Approved:0, Pending:1, Rejected:2, Cancelled:3});
  const WORKFLOW_STATUS_ORDER = Object.freeze({Pending:0, Approved:1, Rejected:2, Cancelled:3});

  function sourceSetup(source = data){
    if(isPlainObject(source?.restaurantSetup))return source.restaurantSetup;
    if(isPlainObject(data?.restaurantSetup))return data.restaurantSetup;
    return {};
  }

  function typeList(source = data){
    return normalizeAbsenceTypeList(sourceSetup(source).absenceTypes || []);
  }

  function activeTypes(source = data){
    return typeList(source).filter(type => type.active !== false);
  }

  function typeById(idValue, source = data){
    return absenceTypeById(sourceSetup(source).absenceTypes || [], idValue);
  }

  function typeFor(absence, source = data){
    return typeById(absence?.absenceTypeId, source) || {
      id:'other',
      name:absence?.reason || 'Leave',
      code:'OTHER',
      category:'other',
      affectsPlanning:true,
      affectsPayroll:true
    };
  }

  function label(absence, fallback = 'Leave', source = data){
    return absenceTypeLabel(sourceSetup(source).absenceTypes || [], absence?.absenceTypeId, absence?.reason || fallback);
  }

  function isHolidayType(type){
    const key = `${type?.id || ''} ${type?.code || ''} ${type?.category || ''} ${type?.name || ''}`.toLowerCase();
    if(/sick|ill|medical|doctor|health|malad|unpaid|recovery|family|training|public|no_show|incident/.test(key))return false;
    return /holiday|vacation|annual|conge/.test(key);
  }

  function defaultType(source = data){
    const types = activeTypes(source);
    return types.find(isHolidayType) || types[0] || {id:'holiday', name:'Holiday'};
  }

  function defaultTypeId(source = data){
    return defaultType(source).id || 'holiday';
  }

  function defaultLabel(source = data){
    return defaultType(source).name || 'Holiday';
  }

  function isHoliday(absence, source = data){
    return isHolidayType(typeFor(absence, source));
  }

  function dateValue(value){
    return normalizeDateString(value) || String(value || '').slice(0,10);
  }

  function rangeDays(start, end, fallback = 0){
    const a = validDate(start);
    const b = validDate(end || start);
    if(!a || !b)return fallback;
    return Math.max(1, Math.round((parseISO(b) - parseISO(a)) / 86400000) + 1);
  }

  function calendarDays(absence, fallback = 1){
    return rangeDays(absence?.start, absence?.end || absence?.start, fallback);
  }

  function effectiveDays(shift, start, end, fallback = 0){
    const daysCount = rangeDays(start, end, fallback);
    if(!daysCount)return 0;
    return shift === 'Full day' ? daysCount : daysCount * 0.5;
  }

  function effectiveHours(shift, start, end){
    const daysCount = rangeDays(start, end, 0);
    if(!daysCount)return 0;
    return shift === 'Full day' ? daysCount * 8 : daysCount * 4;
  }

  function year(absence){
    const start = dateValue(absence?.start);
    return Number(start.slice(0,4)) || new Date().getFullYear();
  }

  function statusRank(status, order = 'planning'){
    const table = order === 'workflow' ? WORKFLOW_STATUS_ORDER : PLANNING_STATUS_ORDER;
    return table[String(status || 'Pending')] ?? 9;
  }

  function statusState(status){
    const clean = String(status || 'Pending');
    if(clean === 'Approved')return 'approved';
    if(clean === 'Rejected')return 'rejected';
    if(clean === 'Cancelled')return 'cancelled';
    return 'pending';
  }

  function affectsPlanning(absence, source = data){
    if(!absence)return false;
    return typeFor(absence, source).affectsPlanning !== false;
  }

  function coversDateShift(absence, date, shift){
    const start = dateValue(absence?.start);
    const end = dateValue(absence?.end || absence?.start) || start;
    const cleanDate = dateValue(date);
    if(!start || !cleanDate || cleanDate < start || cleanDate > end)return false;
    return !absence.shift || absence.shift === 'Full day' || absence.shift === shift;
  }

  function overlapsRange(absence, start, end, shift){
    const absenceStart = dateValue(absence?.start);
    const absenceEnd = dateValue(absence?.end || absence?.start) || absenceStart;
    const rangeStart = dateValue(start);
    const rangeEnd = dateValue(end || start) || rangeStart;
    if(!absenceStart || !rangeStart || absenceEnd < rangeStart || absenceStart > rangeEnd)return false;
    return !absence.shift || absence.shift === 'Full day' || shift === 'Full day' || absence.shift === shift;
  }

  function forDateShift(employee, date, shift, options = {}){
    const statuses = Array.isArray(options.statuses) ? options.statuses : [];
    const allowed = new Set(statuses);
    const source = options.source || data;
    const requirePlanningEffect = options.requirePlanningEffect !== false;
    const order = options.order || 'planning';
    const startMultiplier = options.startOrder === 'desc' ? -1 : 1;
    return (employee?.absences || [])
      .filter(absence => (!allowed.size || allowed.has(absence.status))
        && (!requirePlanningEffect || affectsPlanning(absence, source))
        && coversDateShift(absence, date, shift))
      .sort((a,b) => statusRank(a.status, order) - statusRank(b.status, order)
        || startMultiplier * String(a.start).localeCompare(String(b.start)));
  }

  function primaryForDateShift(employee, date, shift, options = {}){
    return forDateShift(employee, date, shift, options)[0] || null;
  }

  function iconNameForText(value){
    const key = String(value || '').toLowerCase();
    if(/public[\s_-]?holiday/.test(key))return 'celebration';
    if(/sick|ill|medical|doctor|health|malad/.test(key))return 'thermometer';
    if(/holiday|vacation|annual|conge/.test(key))return 'palm';
    return 'calendar';
  }

  function iconName(absence, source = data){
    const type = typeFor(absence, source);
    const key = `${type.id || ''} ${type.code || ''} ${type.category || ''} ${type.name || absence?.reason || ''}`;
    return iconNameForText(key);
  }

  function iconClassName(name){
    return String(name || 'calendar')
      .replace(/([a-z])([A-Z])/g,'$1-$2')
      .replace(/[^a-zA-Z0-9_-]+/g,'-')
      .toLowerCase();
  }

  function safeClassName(value){
    return String(value || '').replace(/[^a-zA-Z0-9_\- ]/g,'').trim();
  }

  function iconMarkup(absence, className = '', source = data){
    const extra = safeClassName(className);
    const name = iconName(absence, source);
    const svg = R.icons?.svg?.(name) || '';
    return `<span class="rs-absence-icon is-${iconClassName(name)}${extra ? ` ${extra}` : ''}" aria-hidden="true">${svg}</span>`;
  }

  function iconLabel(absence, source = data){
    const name = iconName(absence, source);
    if(name === 'thermometer')return 'Sick leave';
    if(name === 'celebration')return 'Public holiday';
    if(name === 'palm')return 'Holiday';
    return 'Leave';
  }

  function dateRangeLabel(absence){
    const start = dateValue(absence?.start);
    const end = dateValue(absence?.end || absence?.start);
    if(!start)return '—';
    if(!end || end === start)return shortDisplayDate(start);
    return `${shortDisplayDate(start)} → ${shortDisplayDate(end)}`;
  }

  function weekdayRangeLabel(absence){
    const start = dateValue(absence?.start);
    const end = dateValue(absence?.end || absence?.start);
    if(!start)return '';
    const startDay = parseISO(start).toLocaleDateString(undefined,{weekday:'short'});
    const endDay = end && end !== start ? parseISO(end).toLocaleDateString(undefined,{weekday:'short'}) : '';
    return endDay ? `${startDay} → ${endDay}` : startDay;
  }

  R.logic.absences = {
    typeList,
    activeTypes,
    typeById,
    typeFor,
    label,
    isHolidayType,
    defaultType,
    defaultTypeId,
    defaultLabel,
    isHoliday,
    dateValue,
    rangeDays,
    calendarDays,
    effectiveDays,
    effectiveHours,
    year,
    statusRank,
    statusState,
    affectsPlanning,
    coversDateShift,
    overlapsRange,
    forDateShift,
    primaryForDateShift,
    iconNameForText,
    iconName,
    iconClassName,
    iconMarkup,
    iconLabel,
    dateRangeLabel,
    weekdayRangeLabel
  };
})();
