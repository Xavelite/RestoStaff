import { recentSupport } from './ranking.js';
import { ROOT_TOPICS, resolveTopic } from './topics.js';
import { uid, seedState } from './model.js';
import { catalogCards } from './catalog.js';
import { canSeeAudience, canViewCard, visibleCollections, areFriends, cardTopics } from './social.js';

export const FEED_TOPICS = [...ROOT_TOPICS.map(t=>({creativity:'Design',travel:'Travel',tools:'Useful tools'})[t.id]||t.label),'Everyday life'];
const sameTopic=(a,b)=>(resolveTopic(a)?.id||a)===(resolveTopic(b)?.id||b);
export const FEED_MODES = { latest: 'Everyone', following: 'Following', friends: 'Friends', interests: 'My topics' };
const person = (data, user) => { if (!data.profiles[user]) throw Error('Choose a demo profile first.'); };
const body = (text, max) => {
  const value = String(text || '').trim();
  if (!value || value.length > max) throw Error(`Write between 1 and ${max.toLocaleString()} characters.`);
  return value;
};
export function feedPreferences(data, user) {
  return data.feedPreferences?.[user] || { mode: 'latest', topics: [], muted: [], hidden: [], blocked: [] };
}
export function setFeedPreferences(data, user, patch) {
  person(data, user);
  const current = feedPreferences(data, user);
  const next = { ...current, ...patch };
  if (!Object.hasOwn(FEED_MODES, next.mode)) throw Error('Choose a feed view.');
  next.topics = [...new Set(next.topics)].filter(t => FEED_TOPICS.includes(t));
  for (const key of ['muted', 'blocked']) next[key] = [...new Set(next[key])].filter(id => id !== user && data.profiles[id]);
  next.hidden = [...new Set(next.hidden)];
  data.feedPreferences[user] = next;
  return next;
}
export function attachmentVisible(data, attachment, viewer) {
  if (!attachment) return true;
  if (attachment.kind === 'card') return canViewCard(data, attachment.owner, data.spaces[attachment.owner]?.cards.find(c => c.id === attachment.id), viewer);
  if (attachment.kind === 'collection') return visibleCollections(data, attachment.owner, viewer).some(c => c.id === attachment.id);
  return false;
}
function blocked(data, a, b) {
  return feedPreferences(data, a).blocked.includes(b) || feedPreferences(data, b).blocked.includes(a);
}
export function allPosts(data) {
  return [...(data.wallPosts || []), ...(data.recommendations || []).map(p => {
    const space = data.spaces[p.owner], card = space?.cards.find(c => c.id === p.cardId);
    return { ...p, legacy: true, topic: card ? cardTopics(space, card)[0] || 'Everyday life' : 'Everyday life', attachment: { kind: 'card', owner: p.owner, id: p.cardId } };
  })];
}
export function canViewPost(data, post, viewer) {
  return !!post && !post.deleted && !blocked(data, viewer, post.userId) && canSeeAudience(data, post.audience, post.userId, viewer) && attachmentVisible(data, post.attachment, viewer);
}
export function wallPosts(data, viewer, { owner, mode = feedPreferences(data, viewer).mode, topic = 'all', saved = false, sort = 'recent', format = 'all' } = {}) {
  const prefs = feedPreferences(data, viewer);
  return allPosts(data).filter(p => (format==='all'||(format==='discussion'&&!p.attachment&&!p.poll)||(format==='question'&&p.intent==='question')||(format==='poll'&&p.poll)||(format==='collection'&&p.attachment?.kind==='collection')||(format==='card'&&p.attachment?.kind==='card')) && canViewPost(data, p, viewer) && (!owner || p.userId === owner) && (!saved || data.postBookmarks.some(b => b.userId === viewer && b.postId === p.id)) &&
    (owner || (!prefs.hidden.includes(p.id) && !prefs.muted.includes(p.userId))) &&
    (topic === 'all' || sameTopic(p.topic,topic)) && (owner || saved || mode === 'latest' || p.userId === viewer ||
    (mode === 'friends' && areFriends(data, viewer, p.userId)) ||
    (mode === 'following' && (data.follows.some(f => f.from === viewer && f.to === p.userId) || (p.attachment?.kind === 'collection' && data.collectionFollows.some(f => f.userId === viewer && f.owner === p.attachment.owner && f.collectionId === p.attachment.id)))) ||
    (mode === 'interests' && prefs.topics.some(t=>sameTopic(t,p.topic)))))
    .sort((a,b)=> {
      const signals=p=>{const likes=data.postLikes.filter(l=>l.postId===p.id),comments=data.postComments.filter(c=>c.postId===p.id&&!c.deleted);return {popular:new Set(likes.map(l=>l.userId)).size+new Set(comments.map(c=>c.userId)).size*2,trending:recentSupport([...likes,...comments]).score};};
      return (['popular','trending'].includes(sort)?signals(b)[sort]-signals(a)[sort]:0)||b.createdAt-a.createdAt||a.id.localeCompare(b.id);
    });
}
export function getPost(data, user, id) {
  const post = allPosts(data).find(p => p.id === id);
  if (!canViewPost(data, post, user)) throw Error('This post is no longer shared with you.');
  return post;
}
export function publishPost(data, user, { text, audience = 'public', topic = 'Everyday life', attachment = null, pollOptions = [], editId = null, intent = 'post' }) {
  person(data, user);
  if (!['public', 'friends', 'private'].includes(audience)) throw Error('Choose who can see your post.');
  if (!FEED_TOPICS.includes(topic)) throw Error('Choose a topic.');
  if (!attachmentVisible(data, attachment, user) || (audience === 'public' && !attachmentVisible(data, attachment, null))) throw Error('The attachment is not public. Change its sharing first, or choose a smaller audience.');
  const old = editId ? data.wallPosts.find(p => p.id === editId && p.userId === user && !p.deleted) : null;
  if (editId && !old) throw Error('Only your own posts can be edited.');
  const labels = pollOptions.map(s => s.trim()).filter(Boolean);
  if (labels.length && (labels.length < 2 || labels.length > 4 || labels.some(s => s.length > 60) || new Set(labels.map(s => s.toLowerCase())).size !== labels.length)) throw Error('A poll needs 2–4 different choices, up to 60 characters each.');
  const post = { id: old?.id || uid(), userId: user, text: body(text, 3000), audience, topic, attachment: attachment ? { kind: attachment.kind, owner: attachment.owner, id: attachment.id } : null, createdAt: old?.createdAt || Date.now() };
  post.intent=intent==='question'?'question':'post';
  if (old?.poll) post.poll = old.poll; // Published poll choices never change underneath votes.
  else if (labels.length) post.poll = { options: labels.map((label, i) => ({ id: String(i), label })), votes: [] };
  if (old) Object.assign(old, post, { editedAt: Date.now() }); else data.wallPosts.push(post);
  return old || post;
}
export function removePost(data, user, id) {
  const posts = data.wallPosts.some(p => p.id === id) ? data.wallPosts : data.recommendations;
  const post = posts.find(p => p.id === id && p.userId === user);
  if (!post) throw Error('Only your own posts can be removed.');
  post.deleted = true;
}
export function postStats(data, user, id) {
  getPost(data, user, id);
  const likes = data.postLikes.filter(p => p.postId === id);
  return { likes: likes.length, liked: likes.some(p => p.userId === user), comments: data.postComments.filter(p => p.postId === id && !p.deleted), saved: data.postBookmarks.some(p => p.postId === id && p.userId === user) };
}
export function togglePost(data, user, id, kind = 'like') {
  person(data, user); getPost(data, user, id);
  const list = kind === 'save' ? data.postBookmarks : data.postLikes;
  const at = list.findIndex(p => p.postId === id && p.userId === user);
  if (at >= 0) list.splice(at, 1); else list.push({ postId: id, userId: user, createdAt:Date.now() });
  return at < 0;
}
export function commentOnPost(data, user, id, text, replyTo = null, attachment = null) {
  person(data, user);
  const post = getPost(data, user, id);
  const parent = replyTo ? data.postComments.find(c => c.id === replyTo && c.postId === id && !c.deleted) : null;
  if (replyTo && !parent) throw Error('That comment is no longer available.');
  const comment = { id: uid(), postId: id, userId: user, text: body(text, 1500), createdAt: Date.now(), replyTo: parent?.replyTo || parent?.id || null };
  if(attachment){if(attachment.kind!=='card'||!attachmentVisible(data,attachment,user)||!attachmentVisible(data,attachment,null))throw Error('Choose a public card to recommend.');comment.attachment={kind:'card',owner:attachment.owner,id:attachment.id};}
  data.postComments.push(comment);
  for (const to of new Set([post.userId, parent?.userId].filter(id => id && id !== user))) data.notifications.push({ id: uid(), to, from: user, postId: id, text: parent?.userId === to ? 'replied to your comment' : 'commented on your post', title: '', createdAt: Date.now(), read: false });
  return comment;
}
export function voteOnPost(data, user, id, option) {
  person(data, user); const post = getPost(data, user, id);
  if (!post.poll?.options.some(o => o.id === option)) throw Error('Choose an answer from this poll.');
  post.poll.votes = post.poll.votes.filter(v => v.userId !== user);
  post.poll.votes.push({ userId: user, option });
}

export function conversationKey(a, b) { return [a, b].sort().join(':'); }
export function messagesBetween(data, user, other) {
  person(data, user); person(data, other);
  return data.messages.filter(m => (m.from === user && m.to === other) || (m.from === other && m.to === user)).sort((a, b) => a.createdAt - b.createdAt);
}
export function unreadMessages(data, user, other = null) {
  return data.messages.filter(m => m.to === user && !m.read && (!other || m.from === other) && !blocked(data, user, m.from)).length;
}
export function markConversationRead(data, user, other) {
  messagesBetween(data, user, other).filter(m => m.to === user).forEach(m => m.read = true);
}
export function sendMessage(data, from, to, text, attachment = null) {
  person(data, from); person(data, to);
  if (from === to) throw Error('Choose someone else to message.');
  if (blocked(data, from, to)) throw Error('Messaging is unavailable between these profiles.');
  if (!attachmentVisible(data, attachment, from) || !attachmentVisible(data, attachment, to)) throw Error('This person cannot access that attachment. Change its sharing first.');
  const message = { id: uid(), from, to, text: String(text || '').trim(), attachment: attachment ? { kind: attachment.kind, owner: attachment.owner, id: attachment.id } : null, createdAt: Date.now(), read: false };
  if (message.text.length > 3000 || (!message.text && !attachment)) throw Error('Write a message or attach a shared card.');
  data.messages.push(message);
  return message;
}

export function upgradeNetwork(data) {
  for (const key of ['wallPosts', 'postLikes', 'postComments', 'postBookmarks', 'messages']) data[key] ||= [];
  data.feedPreferences ||= {};
  if (data.networkVersion >= 1) return false;
  const originals = catalogCards();
  for (const [id, name, color, bio, topic, collectionName, ids] of [
    ['maya', 'Maya Laurent', 'blue', 'Weekend wanderer. Looking for beautiful places and the quieter route.', 'Travel', 'Places to pause', ['holiday-beach', 'holiday-lake', 'holiday-venice', 'holiday-canal', 'maps', 'sncb']],
    ['sam', 'Sam Rivera', 'violet', 'Making things, learning out loud, and collecting tools that do one thing well.', 'Design', 'A creative toolkit', ['figma', 'arena', 'github', 'mdn', 'canva', 'wikipedia']],
  ]) {
    if (data.profiles[id]) continue;
    data.profiles[id] = { name, color, bio, handle: id, demo: true };
    const space = seedState();
    space.settings = { ...space.settings, name: name.split(' ')[0], theme: 'dark', view: 'adaptive', title: collectionName, subtitle: bio };
    space.collections = [{ id: `${id}-collection`, name: collectionName, description: bio, color, icon: topic === 'Travel' ? 'sun' : 'spark', visibility: 'public' }];
    space.cards = ids.map(id => originals.find(c => c.id === id)).filter(Boolean).map(c => ({ ...c, id: `${id}-${c.id}`, collectionId: `${id}-collection`, visibility: 'inherit', topics: [topic], favorite: false }));
    data.spaces[id] = space;
  }
  const seeds = [
    ['maya', 'Travel', 'A reminder to leave a little space in the itinerary. Sometimes the best part is the afternoon you didn’t plan.', 'maya-holiday-beach'],
    ['alex', 'Music', 'Build a Sunday soundtrack with me. One song each. What are you adding?', null, ['Classic rock', 'Soul & jazz', 'Ambient & electronic', 'Something unexpected']],
    ['sam', 'Design', 'My little creative toolkit is open. Useful things I actually come back to, with enough room to add your suggestions.', 'collection'],
    ['maya', 'Travel', 'Mountains or coastline? Today I’m voting for fewer notifications and a longer walk.', 'maya-holiday-lake'],
    ['sam', 'Useful tools', 'What’s one website that quietly makes your day easier? Tell us what you use it for, not just its name.'],
    ['alex', 'Music', 'A session worth putting the phone down for. That guitar tone makes a rainy afternoon feel pretty good.', 'alex-music-khruangbin'],
    ['sam', 'Learning', 'One thing I learned this week: a tiny working version teaches you more than a perfect plan. What did you make?', 'sam-github'],
    ['maya', 'Everyday life', 'Small weekend challenge: pick one place you’ve never been, even if it’s only a few streets away.'],
    ['alex', 'Music', 'The best recommendations come with a story. Which album takes you straight back to a particular year?'],
    ['sam', 'Design', 'Keeping a collection of ideas before I know what they’re for. Patterns tend to appear when you stop trying to force them.', 'sam-arena'],
    ['maya', 'Travel', 'A shared map, a train ticket, and a good pair of shoes. That’s usually enough of a plan for me.', 'maya-maps'],
    ['alex', 'Everyday life', 'A corner of the internet that feels like a good conversation. Less noise, more things worth keeping. What would you want to find here?'],
  ];
  seeds.forEach(([userId, topic, text, ref, pollOptions], i) => {
    const attachment = ref === 'collection' ? { kind: 'collection', owner: userId, id: `${userId}-collection` } : ref && data.spaces[userId]?.cards.some(c => c.id === ref) ? { kind: 'card', owner: userId, id: ref } : null;
    const post = publishPost(data, userId, { text, topic, attachment, pollOptions });
    post.id = `demo-wall-${i}`;
    post.createdAt = Date.now() - (i * 95 + 12) * 60000;
    post.demo = true;
    if (i < 5) data.postLikes.push({ postId: post.id, userId: userId === 'alex' ? 'sam' : 'alex' });
  });
  const first = data.wallPosts.find(p => p.id === 'demo-wall-0');
  if (first) data.postComments.push({ id: 'demo-wall-comment', postId: first.id, userId: 'alex', text: 'The unplanned afternoon is always the one I remember.', createdAt: Date.now() - 300000, replyTo: null });
  const poll = data.wallPosts.find(p => p.poll);
  if (poll) { voteOnPost(data, 'maya', poll.id, '1'); voteOnPost(data, 'sam', poll.id, '0'); }
  const greeting = sendMessage(data, 'alex', 'xavier', 'Hey! Welcome to our little corner of Universal. Found a song, a place, or a useful tool? Send it over.');
  greeting.createdAt = Date.now() - 25 * 60000; greeting.demo = true;
  data.networkVersion = 1;
  return true;
}

