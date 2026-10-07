import { safeURL, metadata, videoSource } from './model.js';
import { resourceKey, searchCards, canViewCard } from './social.js';
import { subjectIds } from './topics.js';
import { contentFields } from './classification.js';

export const DESCRIPTIVE_FIELDS=['title','description','type','color','subjects','contentKind','creator','artist','genre','year','decade','album','series'];
export function detectedType(url,mime='') {
  if(mime.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|flac|opus|aac)(?:[?#]|$)/i.test(url)||/^https:\/\/open\.spotify\.com\/(?:intl-[^/]+\/)?(?:track|album|playlist)\//i.test(url))return 'audio';
  if(mime.startsWith('video/')||videoSource(url))return 'video';
  if(mime||/\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|gif|webp)(?:[?#]|$)/i.test(url))return 'file';
  return 'link';
}
export function captureSuggestion(data,user,input) {
  const url=safeURL(input);if(!url)return null;
  const key=resourceKey({url,type:'link'},user),space=data.spaces[user];
  const existing=space.cards.find(c=>!c.fileId&&c.type!=='widget'&&resourceKey(c,user)===key&&canViewCard(data,user,c,user));
  const known=existing||searchCards(data,user).find(r=>r.key===key)?.card;
  const m=metadata(url),suggestion={url,type:detectedType(url),title:m.title,color:m.color};
  if(known){
    for(const field of DESCRIPTIVE_FIELDS)if(known[field]!=null)suggestion[field]=structuredClone(known[field]);
    Object.assign(suggestion,Object.fromEntries(Object.entries(contentFields(known)).filter(([k,v])=>['artist','genre','year','decade'].includes(k)&&v)));
    suggestion.subjects=subjectIds(known);
  }
  const subjects=subjectIds(suggestion);
  const ranked=space.collections.map(c=>{
    const cards=space.cards.filter(card=>card.collectionId===c.id);
    const relevant=cards.filter(card=>subjects.some(t=>subjectIds(card).some(s=>s===t||s.startsWith(t+'.')||t.startsWith(s+'.'))));
    return {c,score:relevant.length*4+(subjects.some(t=>(c.subjects||[]).includes(t))?12:0)+(suggestion.type!=='link'?cards.filter(c=>c.type===suggestion.type).length*.2:0)};
  }).sort((a,b)=>b.score-a.score);
  const collection=existing?space.collections.find(c=>c.id===existing.collectionId):ranked[0]?.score>0?ranked[0].c:null;
  return {key,suggestion,collection,existing,known:!!known};
}
