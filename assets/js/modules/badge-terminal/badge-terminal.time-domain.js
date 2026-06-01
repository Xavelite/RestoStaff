(function(){
  function now(){return new Date();}

  function clockTime(date=now()){
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  }

  function fullClockDate(date=now()){
    return date.toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  }

  function currentDay(){
    return days[(now().getDay()+6)%7] || 'Monday';
  }

  function serviceKeyFromShift(shift){
    const value=String(shift || '').trim().toLowerCase();
    return value === 'lunch' ? 'lunch' : (value === 'evening' ? 'evening' : '');
  }

  function businessDateForDay(day){
    const weekStart=data?.weekStart || currentWeekStart();
    const index=days.indexOf(String(day || ''));
    return index >= 0 ? addDays(weekStart,index) : todayISO();
  }

  function proofStatusLabel(status){
    const labels={
      captured:'photo captured',
      denied:'camera permission denied',
      unavailable:'camera unavailable',
      failed:'photo capture failed',
      waived:'photo waived',
      not_required:'photo not required',
      missing:'no photo recorded'
    };
    return labels[status] || 'photo status recorded';
  }

  Restogogo.modules.BadgeTerminalTime={now,clockTime,fullClockDate,currentDay,serviceKeyFromShift,businessDateForDay,proofStatusLabel};
})();
