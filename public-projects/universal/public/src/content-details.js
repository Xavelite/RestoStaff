import { escapeHTML as esc } from './model.js';
import { contentFields } from './classification.js';
import { subjectIds, GENRES } from './topics.js';


function context(card){return (card.primarySubject||subjectIds(card)[0]||'').split('.')[0];}
export function contentDetailsFields(card){
  const f=contentFields(card),root=context(card);
  return `<div class="field-row"><label class="field" data-artist-field ${root&&root!=='music'&&!f.artist?'hidden':''}>Artist or group<input name="artist" maxlength="100" value="${esc(f.artist)}" placeholder="If known"></label><label class="field">Genre<input name="genre" maxlength="100" list="genre-suggestions" value="${esc(f.genre)}" placeholder="${esc((GENRES[root]||['Rock','Horror','Tower defense']).slice(0,3).join(', '))}"><datalist id="genre-suggestions">${(GENRES[root]||[...new Set(Object.values(GENRES).flat())]).map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist></label></div><div class="field-row"><label class="field">Release year<input name="year" type="number" min="1000" max="2100" value="${f.year||''}" placeholder="If known"></label><label class="field">Decade<select name="decade"><option value="">Not specified</option>${[...new Set([f.decade,...Array.from({length:13},(_,i)=>(1900+i*10)+'s')].filter(Boolean))].sort().map(d=>`<option ${f.decade===d?'selected':''}>${d}</option>`).join('')}</select></label></div><div class="field-row"><label class="field">Album<input name="album" maxlength="100" value="${esc(card.album||'')}" placeholder="If this is part of an album"></label><label class="field">Series<input name="series" maxlength="100" value="${esc(card.series||'')}" placeholder="A book, game or film series"></label></div><p class="form-hint">Genre and year describe the content, whatever its format. A year determines the decade. Leave unknown details empty.</p>`;
}
export function refreshDetailFields(form){
  if(!form?.elements?.primarySubject)return;
  const root=form.elements.primarySubject.value.split('.')[0],list=form.querySelector('#genre-suggestions');
  if(list)list.innerHTML=(GENRES[root]||[...new Set(Object.values(GENRES).flat())]).map(v=>`<option value="${esc(v)}"></option>`).join('');
  const artist=form.querySelector('[data-artist-field]');if(artist)artist.hidden=!!root&&root!=='music'&&!form.elements.artist.value;
}
