import { escapeHTML as esc } from './model.js';
import { icon } from './icons.js';

export function friendControl(data,me,owner,compact=false){
  if(me===owner)return '';
  const request=data.requests.find(r=>[r.from,r.to].includes(me)&&[r.from,r.to].includes(owner)&&['accepted','pending'].includes(r.status));
  let label='Add friend',action='friend',extra='',ico='users';
  if(request?.status==='accepted'){label='Friends';action='relationship-more';ico='check';}
  else if(request?.status==='pending'){
    if(request.to===me){label='Accept';action='request';extra=`data-id="${esc(request.id)}" data-value="accept"`;ico='check';}
    else {label='Requested';action='relationship-more';ico='clock';}
  }
  return `<button type="button" class="${compact?'community-friend':'secondary friend-control'} ${!request?'friend-primary':''}" data-social="${action}" data-owner="${esc(owner)}" ${extra} title="${label} · ${esc(data.profiles[owner]?.name)}">${icon(ico)}${label}</button>`;
}
