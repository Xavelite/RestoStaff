import { CONTENT_KINDS } from './topics.js';
export function smartRules(value={}) {
  value=value&&typeof value==='object'?value:{};
  const scope=['mine','friends','everyone'].includes(value.scope)?value.scope:'everyone';
  const rule={scope,followingOnly:!!value.followingOnly,query:String(value.query||'').slice(0,200),topic:String(value.topic||'all').slice(0,100),type:['link','video','audio','file'].includes(value.type)?value.type:'all',sort:['relevant','trending','popular','liked','saved','recent'].includes(value.sort)?value.sort:'relevant',limit:Math.max(4,Math.min(48,Number(value.limit)||12))};
  for(const field of ['artist','genre','decade'])rule[field]=String(value[field]||'').slice(0,100);
  rule.kind=Object.hasOwn(CONTENT_KINDS,value.kind)?value.kind:'all';
  rule.decades=Array.isArray(value.decades)?value.decades.filter(v=>/^\d{3}0s$/.test(v)).slice(0,12):[];
  return rule;
}
