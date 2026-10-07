import { subjectLabels, subjectText, subjectIds, GENRES } from './topics.js';
// Content fields describe a resource. Tags and progress belong to its saved card.
export const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/tower[ -]defence/g, 'tower defense').replace(/sci[ -]fi/g, 'science fiction').trim();
export const cleanTags = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).map(s => String(s).trim().slice(0, 40)).filter(Boolean))].slice(0, 16);
export const inCollection = (card, id) => card.collectionId === id || (card.collectionIds || []).includes(id);
export const PROGRESS = { none:'No status', later:'For later', active:'In progress', done:'Completed' };
export function contentFields(card) {
  const subjects=subjectIds(card);
  const musical = subjects.length ? subjects.some(id=>id==='music'||id.startsWith('music.')) : card.type === 'audio' || /rock|music|tiny desk|tadow/i.test(`${card.id} ${card.collectionId} ${card.title}`);
  const artist = card.artist || (musical && card.title.includes(' · ') ? card.title.split(' · ')[0] : '');
  const year = Number(card.year) || (musical ? Number(card.description?.match(/\b(?:19|20)\d{2}\b/)?.[0]) : 0) || null;
  const catalogDecade = /rock-(queen|europe|survivor|badname)$/.test(card.id) ? '1980s' : /rock-(nirvana|rem|oasis|metallica)$/.test(card.id) ? '1990s' : '';
  const decade = year ? `${Math.floor(year / 10) * 10}s` : card.decade || catalogDecade;
  const genre = canonicalGenre(card.genre) || (musical && /rock/i.test(`${card.id} ${card.collectionId}`) ? 'Rock' : '');
  const topics = cleanTags(subjects.length?subjectLabels(card):(card.topics || []));
  if (musical && !topics.includes('Music')) topics.push('Music');
  return { artist, year, decade, genre, topics, subjects, creator:card.creator||'', kind:card.contentKind||'' };
}
export function parseQuery(query) {
  let text = normalize(query).replace(/\b(?:19)?([89]0)s\b/g, '19$1s').replace(/\b(?:20)?([012]0)s\b/g, '20$1s');
  const decades = [...new Set(text.match(/\b(?:19|20)\d0s\b/g) || [])];
  text = text.replace(/\b(?:19|20)\d0s\b/g, '').replace(/[^a-z0-9\s/-]/g, ' ');
  const tokens = text.split(/\s+/).filter(t => t && !['the','from','and','or','of','in','a','an','for'].includes(t));
  return { tokens, decades };
}
export function matchResource(card, query, extra = '', personal = false) {
  const fields = contentFields(card), { tokens, decades } = parseQuery(query);
  const haystack = normalize([card.title, card.description, card.url, fields.artist, fields.genre, fields.decade, fields.topics.join(' '), subjectText(card),fields.creator,fields.kind,card.album,card.series,extra,
    personal ? `${(card.tags || []).join(' ')} ${card.note || ''} ${card.fileName || ''}` : ''].join(' '));
  if (decades.length && !decades.includes(fields.decade)) return { matches:false, relevance:0 };
  if (tokens.some(t => !haystack.includes(t))) return { matches:false, relevance:0 };
  const title = normalize(card.title), phrase = tokens.join(' ');
  const relevance = phrase && title === phrase ? 100 : tokens.length && tokens.every(t => title.includes(t)) ? 80 : tokens.length ? 40 : decades.length ? 40 : 0;
  return { matches:true, relevance };
}

const genreParents={'alternative rock':'Rock','hard rock':'Rock','indie rock':'Rock','progressive rock':'Rock','tower defense':'Strategy'};
export function canonicalGenre(value){const label=String(value||'').trim();return Object.values(GENRES).flat().find(g=>normalize(g)===normalize(label))||label;}
export function genreMatches(value,wanted){return normalize(value)===normalize(wanted)||normalize(genreParents[normalize(value)])===normalize(wanted);}
export function genreChoices(values){return [...new Set(values.filter(Boolean).flatMap(v=>[canonicalGenre(v),genreParents[normalize(v)]].filter(Boolean)))].sort();}
