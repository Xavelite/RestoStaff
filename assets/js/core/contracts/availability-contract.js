/* Availability contract: sparse slot availability values only. */
function normalizeAvailabilityValue(value){
  if(value === true || value === 'available') return true;
  if(value === 'partial') return 'partial';
  if(value === false || value === 'unavailable') return 'unavailable';
  if(isPlainObject(value)){
    if(value.state === 'available') return true;
    if(value.state === 'partial') return 'partial';
    if(value.state === 'unavailable') return 'unavailable';
  }
  return undefined;
}
