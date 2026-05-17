/* Availability contract: sparse slot availability values only. */
function normalizeAvailabilityValue(value){
  if(value === true || value === 'available') return true;
  if(value === 'partial') return 'partial';
  if(isPlainObject(value)){
    if(value.state === 'available') return true;
    if(value.state === 'partial') return 'partial';
  }
  return undefined;
}
