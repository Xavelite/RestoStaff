import { createFlowUI } from './flow-ui.js';
import { newArrivals } from './dashboard-highlights.js';
import { friendControl } from './relationship-controls.js';
import { openPopover } from './surfaces.js';
import { icon } from './icons.js';
import { escapeHTML as esc } from './model.js';
import { effectiveAudience, resourceKey } from './social.js';
import { FEED_MODES, FEED_TOPICS, feedPreferences, setFeedPreferences, wallPosts, getPost, publishPost, removePost, postStats, togglePost, commentOnPost, voteOnPost, attachmentVisible } from './network.js';
import { attachmentChoices, attachmentHTML, encodeAttachment, decodeAttachment, relativeTime } from './social-content.js';

export function createCommunityUI(ctx, helpers) {
  const { action, avatar, name, profileChip, audience, top, empty } = helpers;
  const data = () => ctx.data(), me = () => data().activeUser;
  const flow=createFlowUI(ctx,helpers);
  let communityView="feed", arrivalsOnly=false;
  const viewTabs=()=>`<nav class="community-view-tabs" aria-label="Community view"><button data-social="community-view" data-value="feed" aria-current="${communityView==='feed'?'page':'false'}">${icon("users")}Feed</button><button data-social="community-view" data-value="flow" aria-current="${communityView==='flow'?'page':'false'}">${icon("flow")}Flow <span>Follow your curiosity</span></button></nav>`;
  let limit = 6, topic = 'all', savedOnly = false, activePost = null, replyTo = null, commentDraft = '', focusedPost = null;
  const commentDrafts = new Map(), recommendationDrafts=new Map();
  const composerDrafts=new Map();let composerOpen=false,composerKey='',sort='recent',formatFilter='all';
  const sortNames={recent:'Newest first',popular:'Most popular',trending:'Trending this week'};
  function beforeRender() {
    flow.beforeRender();
    const root=document.querySelector('#wall-inline-composer');if(!root)return;
    const copy=root.cloneNode(true), fields=[...root.querySelectorAll('input,textarea,select')], clones=[...copy.querySelectorAll('input,textarea,select')];
    fields.forEach((field,i)=>{const c=clones[i];if(field.tagName==='TEXTAREA')c.textContent=field.value;else if(field.tagName==='SELECT')[...c.options].forEach(o=>o.toggleAttribute('selected',o.value===field.value));else {c.setAttribute('value',field.value);c.toggleAttribute('checked',field.checked);}});
    composerDrafts.set(composerKey,copy.innerHTML);
  }
  function inlineComposer(title,subtitle,body,footer) {
    communityView="feed"; arrivalsOnly=false;
    composerDrafts.set(composerKey,'<header class="inline-composer-heading"><strong>'+esc(title)+'</strong>'+action('wall-close-composer',icon('close'),'aria-label="Close composer, keep draft"','icon-btn')+'</header>'+body+'<div class="inline-composer-actions">'+footer.replace('data-action="close-dialog"','data-social="wall-close-composer"').replace('Cancel','Close draft')+'</div>');
    composerOpen=true;ctx.closeModal();ctx.ui().page='community';ctx.render();document.querySelector('#wall-inline-composer')?.scrollIntoView({block:'nearest',behavior:'smooth'});document.querySelector('#wall-compose-text')?.focus({preventScroll:true});
  }
  const postAttrs = id => `data-id="${esc(id)}"`;
  function pollHTML(post, readOnly = false) {
    const { options, votes } = post.poll;
    const selected = votes.find(v => v.userId === me())?.option;
    return `<div class="wall-poll" role="group" aria-label="Poll choices">${options.map(o => {
      const percent = votes.length ? Math.round(votes.filter(v => v.option === o.id).length * 100 / votes.length) : 0;
      return `<button class="poll-option ${selected === o.id ? 'chosen' : ''}" data-social="wall-vote" ${postAttrs(post.id)} data-option="${o.id}" aria-pressed="${selected === o.id}" ${readOnly ? 'disabled' : ''}><span class="poll-bar" style="width:${percent}%"></span><span>${selected === o.id ? icon('check') : ''}${esc(o.label)}</span><strong>${percent}%</strong></button>`;
    }).join('')}<small>${votes.length} ${votes.length === 1 ? 'vote' : 'votes'} · ${readOnly ? 'Poll results' : selected ? 'You can change your vote' : 'Choose one answer'}</small></div>`;
  }
  function postHTML(post, viewer = me(), inDialog = false) {
    const stats = postStats(data(), viewer, post.id), readOnly = viewer !== me();
    return `<article class="wall-post" data-post="${esc(post.id)}"><header><div class="wall-author">${profileChip(post.userId)}<span><time datetime="${new Date(post.createdAt).toISOString()}" title="${new Date(post.createdAt).toLocaleString()}">${relativeTime(post.createdAt)}</time><span>·</span>${audience(post.audience)}${post.editedAt ? '<span>· edited</span>' : ''}</span></div>${!readOnly ? action('wall-menu', icon('more'), `${postAttrs(post.id)} aria-label="Options for ${esc(name(post.userId))}’s post"`, 'icon-btn') : ''}</header>${post.intent==='question'?'<div class="question-label">'+icon('users')+'Asking the community</div>':''}<p class="wall-text">${esc(post.text)}</p>${post.attachment ? attachmentHTML(ctx, post.attachment, viewer, { large: true }) : ''}${post.poll ? pollHTML(post, readOnly) : ''}<div class="wall-counts"><span>${stats.likes ? `${icon('heart')}${stats.likes} ${stats.likes === 1 ? 'like' : 'likes'}` : 'Start a conversation'}</span><span>${stats.comments.length} ${stats.comments.length === 1 ? 'comment' : 'comments'}</span></div>${!readOnly ? `<footer>${action('wall-like', icon('heart') + (stats.liked ? 'Liked' : 'Like'), `${postAttrs(post.id)} aria-pressed="${stats.liked}"`, `quiet-action ${stats.liked ? 'liked' : ''}`)}${action('wall-open', icon('comment') + (activePost === post.id ? 'Hide replies' : post.intent==='question'?'Recommend a card':'Comment'), `${postAttrs(post.id)} aria-expanded="${activePost === post.id}"`, 'quiet-action')}${action('wall-save', icon(stats.saved ? 'check' : 'bookmark') + (stats.saved ? 'Saved' : 'Save post'), `${postAttrs(post.id)} aria-pressed="${stats.saved}"`, 'quiet-action')}${post.attachment ? action('message-share', icon('share') + 'Send', `data-attachment="${esc(encodeAttachment(post.attachment))}"`, 'quiet-action') : ''}</footer>` : ''}${!inDialog ? `<div class="wall-context"><span class="wall-topic">${esc(post.topic || 'Everyday life')}</span>${post.demo ? '<span>Demo post</span>' : ''}</div>` : ''}${!readOnly && activePost === post.id ? commentsHTML(post.id) : ''}</article>`;
  }
  function renderPosts(owner = null, viewer = me()) {
    if (focusedPost && !owner) {
      try { return `<div class="focused-conversation">${action('wall-all', '← Back to feed', '', 'text-btn')}</div>` + postHTML(getPost(data(), viewer, focusedPost), viewer); } catch { focusedPost = null; activePost = null; }
    }
    const posts = wallPosts(data(), viewer, { owner, topic: owner ? 'all' : topic, saved: !owner && savedOnly, sort:owner?'recent':sort, format:owner?'all':formatFilter });
    if (!posts.length) return empty(savedOnly ? 'Keep the conversations you love.' : 'A little space for your people.', savedOnly ? 'Save a post and come back to it here.' : feedPreferences(data(), me()).mode === 'interests' ? 'Choose your topics in Feed settings to bring them here.' : 'Share a thought, follow someone, or try Latest to explore the community.', viewer === me() ? action('wall-compose', 'Create a post ' + icon('plus'), '', 'primary') : '');
    return (owner ? posts : posts.slice(0, limit)).map(p => postHTML(p, viewer)).join('') + (!owner ? `<div class="feed-end">${posts.length > limit ? `${action('wall-more', 'More from your community ' + icon('down'), '', 'secondary')}<p>${limit} of ${posts.length} posts · ${sortNames[sort]}</p>` : `${icon('check')}<strong>You’re all caught up.</strong><p>Good things can wait. Your feed will be here.</p>`}</div>` : '');
  }
  function communityAside(people) {
    const total=Object.values(data().profiles).filter(p=>p.role!=='curator').length;
    return `<aside class="wall-aside structured-community" aria-label="Your community"><section class="feed-manifesto community-intro"><span class="community-intro-orbit" aria-hidden="true"></span><span class="manifesto-symbol">${icon('spark')}</span><span class="eyebrow">YOUR FEED. YOUR RULES.</span><h2>You choose <br>what comes next.</h2><p>People you follow. Topics you pick.<br>A more interesting internet, together.</p>${action('wall-browse-people','Find your people '+icon('arrow'),'','primary')}</section><section class="wall-people compact-people"><div class="aside-heading"><h2>Meet your community</h2>${action('wall-browse-people','See all '+icon('arrow'),'','text-btn')}</div><div class="community-people-list">${people.slice(0,4).map(id=>{const following=data().follows.some(f=>f.from===me()&&f.to===id),followsYou=data().follows.some(f=>f.from===id&&f.to===me());return `<article class="community-person"><button class="community-person-link" data-social="profile" data-owner="${esc(id)}" aria-label="View ${esc(name(id))}’s profile">${avatar(id)}<span><strong>${esc(name(id))}</strong><small>${esc(data().profiles[id].bio)}</small>${followsYou?'<em>Follows you</em>':''}</span></button><div class="community-person-actions">${friendControl(data(),me(),id,true)}${action('follow',following?'Following':'Follow',`data-owner="${esc(id)}" aria-label="${following?'Unfollow':'Follow'} ${esc(name(id))}" aria-pressed="${following}"`,`community-follow ${following?'following':''}`)}</div></article>`;}).join('')}</div></section>${action('wall-browse-people','<span class="community-count-symbol">'+icon('users')+'</span><span><strong>'+total+' demo profiles</strong><small>Explore a different point of view.</small></span>'+icon('chevron'),'','community-count-card')}<p class="wall-demo-note">Your follows and conversations stay in this browser demo.</p></aside>`;
  }
  function render() {
    if(communityView==="flow")return top()+viewTabs()+flow.render();
    const prefs = feedPreferences(data(), me());
    const people = Object.keys(data().profiles).filter(id => id !== me() && data().profiles[id].role!=='curator' && !prefs.blocked.includes(id) && !feedPreferences(data(),id).blocked.includes(me()));
    const arrivalsCount = newArrivals(data(), me()).length;
    const tabs = `<div class="feed-tabs" role="group" aria-label="Community feed">${Object.entries(FEED_MODES).map(([value,label]) => action('feed-mode', label, `data-value="${value}" aria-pressed="${!arrivalsOnly && !savedOnly && prefs.mode === value}"`, !arrivalsOnly && !savedOnly && prefs.mode === value ? 'selected' : '')).join('')}${action('wall-arrivals',icon('spark')+'New for you'+(arrivalsCount?'<span class="feed-arrival-count">'+arrivalsCount+'</span>':''),`aria-pressed="${arrivalsOnly}"`,arrivalsOnly?'selected':'')}</div>`;
    const filters = arrivalsOnly ? '' : `<div class="feed-order"><label class="feed-sort"><span class="sr-only">Feed order</span><select id="wall-sort" aria-label="Feed order">${Object.entries(sortNames).map(([v,l])=>`<option value="${v}" ${sort===v?'selected':''}>${l}</option>`).join('')}</select></label><select id="wall-format" aria-label="Filter post type">${Object.entries({all:'All posts',discussion:'Conversations',question:'Asking for ideas',card:'Shared cards',collection:'Collections',poll:'Polls'}).map(([v,l])=>`<option value="${v}" ${formatFilter===v?'selected':''}>${l}</option>`).join('')}</select><select id="wall-topic" aria-label="Filter feed topic"><option value="all">All topics</option>${FEED_TOPICS.map(t => `<option ${topic === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><p class="feed-sort-help">${sort==='trending'?'Distinct people active in the last 7 days; newer activity counts more.':sort==='popular'?'Likes + twice the number of distinct commenters. Repeated comments do not boost a post.':'Posts in time order. No popularity boost.'}</p>`;
    const composer = arrivalsOnly ? '' : `<section class="wall-composer" ${composerOpen?'hidden':''}><button data-social="wall-compose" class="wall-composer-prompt">${avatar(me())}<span>What would you like to share, ${esc(name(me()).split(' ')[0])}?</span>${icon('edit')}</button><div class="wall-composer-types">${[['photo','image','Photo'],['card','link','Card'],['collection','collection','Collection'],['poll','chart','Poll'],['question','users','Ask for ideas']].map(([format,ico,label]) => action('wall-compose', icon(ico) + label, `data-format="${format}"`, 'quiet-action')).join('')}</div></section>${composerOpen?`<section id="wall-inline-composer" class="wall-inline-composer">${composerDrafts.get(composerKey)||""}</section>`:""}`;
    return `${top()}${viewTabs()}<section class="wall-heading"><div><span class="eyebrow">COMMUNITY / ON YOUR TERMS</span><h1>A world worth <span>sharing.</span></h1><p>Good finds, everyday moments, and the people behind them.</p></div><div class="wall-heading-tools">${action('wall-saved', icon('bookmark') + (savedOnly ? 'Back to feed' : 'Saved posts'), `aria-pressed="${savedOnly}"`, 'secondary')}${action('wall-settings', icon('settings') + 'Feed settings', '', 'secondary')}</div></section><div class="wall-layout"><div class="wall-feed">${composer}<div class="wall-feed-controls">${tabs}${filters}</div><div id="community-posts">${arrivalsOnly?ctx.renderArrivals():renderPosts()}</div></div>${communityAside(people)}</div>`;
  }
  function composerOptions(format, selected = '') {
    return `<option value="">Choose ${format === 'collection' ? 'a collection' : format === 'photo' ? 'a picture' : 'a card'}…</option>` + attachmentChoices(data(), me(), format).map(item => `<option value="${esc(encodeAttachment(item))}" ${encodeAttachment(item) === selected ? 'selected' : ''}>${esc(item.title)} · ${esc(name(item.owner))}</option>`).join('');
  }
  function updateComposerAudience() {
    const form = document.querySelector('#social-wall-compose');
    if (!form) return;
    const attachment = ['text','poll','question'].includes(form.elements.format.value) ? null : decodeAttachment(form.elements.attachment.value);
    const space = attachment && data().spaces[attachment.owner];
    const card = attachment?.kind === 'card' && space?.cards.find(c => c.id === attachment.id);
    const widest = !attachment ? 'public' : card ? effectiveAudience(space, card) : space?.collections.find(c => c.id === attachment.id)?.visibility || 'private';
    const levels = { private:0, friends:1, public:2 };
    const select = form.elements.audience;
    for (const option of select.options) option.disabled = levels[option.value] > levels[widest] || (option.value === 'public' && !attachmentVisible(data(), attachment, null));
    if (select.selectedOptions[0]?.disabled) select.value = widest === 'public' ? 'friends' : widest;
  }
  function showComposer(format = 'text', attachment = null, editId = null) {
    communityView='feed'; arrivalsOnly=false;
    beforeRender();document.querySelector('#wall-inline-composer')?.remove();composerKey=me()+':'+(editId||'new');
    if(composerDrafts.has(composerKey)) {
      composerOpen=true;ctx.closeModal();ctx.ui().page='community';ctx.render();
      const field=document.querySelector('#social-wall-compose [name="format"]');
      if(format!=='text'&&field){field.value=format;change(field);}
      if(attachment){const select=document.querySelector('#social-wall-compose [name="attachment"]');select.value=encodeAttachment(attachment);change(select);}
      document.querySelector('#wall-compose-text')?.focus();return;
    }
    const old = editId ? getPost(data(), me(), editId) : null;
    if (old) { attachment = old.attachment; format = old.intent==='question'?'question':old.poll ? 'poll' : attachment?.kind === 'collection' ? 'collection' : attachment ? 'card' : 'text'; }
    inlineComposer(old ? 'Edit your post.' : 'A little something to share.', 'A thought, a find, a moment. Make it yours.', `<form id="social-wall-compose" data-edit-id="${editId || ''}" class="wall-compose-form"><div class="composer-person">${avatar(me())}<strong>${esc(name(me()))}</strong><select name="audience" aria-label="Post audience">${[['public','Everyone'],['friends','Friends'],['private','Only me']].map(([v,l]) => `<option value="${v}" ${(old?.audience || (attachment && !attachmentVisible(data(), attachment, null) ? 'friends' : 'public')) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><label class="sr-only" for="wall-compose-text">Your post</label><textarea id="wall-compose-text" name="message" maxlength="3000" rows="5" placeholder="What’s on your mind?" required>${esc(old?.text || '')}</textarea><input name="format" type="hidden" value="${esc(format)}"><div class="composer-format-bar" role="group" aria-label="Add to your post">${[['text','edit','Text'],['photo','image','Photo'],['card','link','Card'],['collection','collection','Collection'],['poll','chart','Poll'],['question','users','Ask for ideas']].map(([v,ico,label])=>action('wall-format',icon(ico)+label,`data-format="${v}" aria-pressed="${format===v}" ${old?.poll?'disabled':''}`,`composer-format ${format===v?'selected':''}`)).join('')}</div><label class="composer-topic">Topic<select name="topic" aria-label="Post topic">${FEED_TOPICS.map(t=>`<option ${t===(old?.topic||'Everyday life')?'selected':''}>${t}</option>`).join('')}</select></label><label class="field" id="wall-attachment-field" ${['text','poll','question'].includes(format) ? 'hidden' : ''}>Choose from shared spaces<select name="attachment" aria-label="Post attachment">${composerOptions(format, encodeAttachment(attachment))}</select></label><div id="wall-compose-preview">${attachmentHTML(ctx, attachment, me())}</div><div id="wall-poll-fields" ${format !== 'poll' ? 'hidden' : ''}><p class="form-hint">2–4 choices. People can change their vote.</p>${[0,1,2,3].map(i => `<label class="field">Choice ${i + 1}${i > 1 ? ' (optional)' : ''}<input name="poll${i}" maxlength="60" value="${esc(old?.poll?.options[i]?.label || '')}" ${old?.poll ? 'disabled' : ''}></label>`).join('')}</div><p class="form-hint">Attachments keep their original audience. Only people who can see both can view this post.</p><p class="social-form-error" role="alert"></p></form>`, `<button class="secondary" data-action="close-dialog">Cancel</button><button class="primary" form="social-wall-compose" type="submit">${icon('share')}${old ? 'Save changes' : 'Share post'}</button>`);
    const message=document.querySelector('#wall-compose-text');if(format==='question')message.placeholder='What would you love a recommendation for? A great game, a useful tool, somewhere to go…';
    updateComposerAudience(); ctx.hydrate();
  }
  function recommendationOptions(query,selected=''){
    const seen=new Set();return '<option value="">No card attached</option>'+attachmentChoices(data(),me(),'card').filter(item=>{
      if(!attachmentVisible(data(),item,null)||!item.title.toLowerCase().includes(query.toLowerCase()))return false;
      const card=data().spaces[item.owner].cards.find(c=>c.id===item.id),key=resourceKey(card,item.owner);if(seen.has(key))return false;seen.add(key);return true;
    }).map(item=>`<option value="${esc(encodeAttachment(item))}" ${encodeAttachment(item)===selected?'selected':''}>${esc(item.title)}</option>`).join('');
  }
  function commentsHTML(id) {
    const comments = postStats(data(), me(), id).comments;
    const row = (c, reply = false) => `<article class="comment-row ${reply ? 'comment-reply' : ''}">${avatar(c.userId)}<div><div class="comment-byline"><strong>${esc(name(c.userId))}</strong><time>${relativeTime(c.createdAt)}</time>${c.userId === me() ? action('wall-delete-comment', icon('trash'), `data-comment="${c.id}" aria-label="Delete your comment"`, 'icon-btn') : ''}</div><p>${esc(c.text)}</p>${c.attachment?attachmentHTML(ctx,c.attachment,me()):''}${action('wall-reply', 'Reply', `data-comment="${c.id}"`, 'comment-reply-button')}</div></article>`;
    const replying = comments.find(c => c.id === replyTo);
    return `<section class="inline-conversation" aria-label="Post conversation"><div class="wall-comments">${comments.filter(c => !c.replyTo || !comments.some(p => p.id === c.replyTo)).map(c => row(c) + comments.filter(r => r.replyTo === c.id).map(c => row(c, true)).join('')).join('') || '<p class="form-hint">Be the first to add your perspective.</p>'}</div><form id="social-wall-comment" data-id="${id}" class="comment-form">${replying ? `<div class="replying-to">Replying to ${esc(name(replying.userId))}${action('wall-cancel-reply', 'Cancel', '', 'text-btn')}</div>` : ''}<label for="wall-comment">${replying ? 'Your reply' : 'Your comment'}</label><textarea id="wall-comment" name="comment" rows="2" maxlength="1500" placeholder="Add something to the conversation…">${esc(commentDraft)}</textarea><details class="comment-recommendation" ${getPost(data(),me(),id).intent==='question'?'open':''}><summary>${icon('link')}Recommend a card</summary><input type="search" data-recommendation-search aria-label="Find a card to recommend" placeholder="Find a public card…"><select name="recommendation" aria-label="Card recommendation">${recommendationOptions('',recommendationDrafts.get(id)||'')}</select></details><button type="submit" class="primary">${replying ? 'Reply' : 'Post comment'}</button><p class="social-form-error" role="alert"></p></form></section>`;
  }
  function showPost(id, focus = false) {
    getPost(data(), me(), id); activePost = id;
    const scroll = window.scrollY; ctx.render(); window.scrollTo(0, scroll);
    if (focus) document.querySelector("#wall-comment")?.focus({ preventScroll: true });
  }
  function settings() {
    const prefs = feedPreferences(data(), me());
    ctx.modal('Your feed, your rules.', 'Choose your people and topics. Use the feed’s order control for Newest, Popular, or Trending.', `<form id="social-feed-settings"><label class="field">Your default view<select name="mode">${Object.entries(FEED_MODES).map(([v,l]) => `<option value="${v}" ${prefs.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><p class="field-label">Topics for My topics</p><div class="feed-topic-choices">${FEED_TOPICS.map(t => `<label><input type="checkbox" name="topics" value="${t}" ${prefs.topics.includes(t) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div><p class="form-hint">Likes and saves don’t secretly change your feed. “My topics” uses only the choices above.</p>${prefs.muted.length ? `<div class="feed-muted"><h3>Muted people</h3>${prefs.muted.map(id => `<div>${esc(name(id))}${action('wall-unmute', 'Unmute', `data-owner="${id}"`, 'text-btn')}</div>`).join('')}</div>` : ''}${prefs.hidden.length ? `<p>${action('wall-reset-hidden', `Show ${prefs.hidden.length} hidden posts again`, '', 'text-btn')}</p>` : ''}<p class="social-form-error" role="alert"></p></form>`, '<button class="secondary" data-action="close-dialog">Cancel</button><button class="primary" type="submit" form="social-feed-settings">Save feed choices</button>');
  }
  async function click(el) {
    if(el.dataset.social==="community-view"){communityView=el.dataset.value;ctx.render();window.scrollTo(0,0);return true;}
    if(await flow.click(el))return true;
    const act = el.dataset.social, id = el.dataset.id;
    if(act==='wall-format'){const field=document.querySelector('#social-wall-compose [name="format"]');if(field){field.value=el.dataset.format;change(field);}return true;}
    if(act==='wall-close-composer'){beforeRender();composerOpen=false;ctx.render();return true;}
    if(act==='wall-browse-people'){ctx.ui().page='discover';ctx.browsePeople?.();return true;}
    if (act === 'recommend' || act === 'wall-compose') { showComposer(el.dataset.format || (el.dataset.cardId ? 'card' : 'text'), el.dataset.cardId ? { kind: 'card', owner: el.dataset.owner, id: el.dataset.cardId } : null); return true; }
    if (act === 'feed-mode') { arrivalsOnly = false; focusedPost = null; savedOnly = false; limit = 6; setFeedPreferences(data(), me(), { mode: el.dataset.value }); await ctx.persist(); ctx.render(); return true; }
    if (act === 'wall-arrivals') { arrivalsOnly = true; focusedPost = null; activePost = null; savedOnly = false; ctx.render(); return true; }
    if (!act.startsWith('wall-')) return false;
    if (act === 'wall-more') { limit += 6; const anchor = window.scrollY; ctx.render(); window.scrollTo(0, anchor); return true; }
    if (act === 'wall-saved') { arrivalsOnly = false; savedOnly = !savedOnly; limit = 6; topic = 'all'; ctx.render(); return true; }
    if (act === 'wall-settings') { settings(); return true; }
    if (act === 'wall-all') { arrivalsOnly = false; focusedPost = null; activePost = null; ctx.render(); return true; }
    if (act === 'wall-notice') {
      communityView='feed'; arrivalsOnly=false;
      getPost(data(), me(), id); ctx.closeModal(); ctx.ui().page = 'community'; focusedPost = id;
      replyTo = null; commentDraft = commentDrafts.get(id) || ''; showPost(id, true); window.scrollTo(0,0); return true;
    }
    if (act === 'wall-open') {
      if (activePost === id) { activePost = null; ctx.render(); return true; }
      replyTo = null; commentDraft = commentDrafts.get(id) || ''; showPost(id, true); return true;
    }
    if (act === 'wall-reply' || act === 'wall-cancel-reply') { replyTo = act === 'wall-reply' ? el.dataset.comment : null; showPost(activePost, true); return true; }
    if (act === 'wall-menu') {
      const post = getPost(data(), me(), id);
      openPopover(el, 'Post options', `<div class="menu-list">${post.userId === me() ? `${!post.legacy ? action('wall-edit', icon('edit') + 'Edit post', postAttrs(id), '') : ''}${action('wall-remove', icon('trash') + 'Remove post', postAttrs(id), 'danger')}` : `${action('wall-hide', icon('close') + 'Hide this post', postAttrs(id), '')}${action('wall-mute', icon('bell') + `Mute ${esc(name(post.userId))}`, `data-owner="${post.userId}"`, '')}`}</div>`); return true;
    }
    if (act === 'wall-edit') { showComposer('text', null, id); return true; }
    if (act === 'wall-like' || act === 'wall-save') togglePost(data(), me(), id, act === 'wall-save' ? 'save' : 'like');
    else if (act === 'wall-vote') voteOnPost(data(), me(), id, el.dataset.option);
    else if (act === 'wall-delete-comment') { const c = data().postComments.find(c => c.id === el.dataset.comment && c.userId === me()); if (c) c.deleted = true; }
    else if (act === 'wall-remove') { removePost(data(), me(), id); ctx.closeModal(); ctx.toast('Post removed.'); }
    else if (act === 'wall-hide') { setFeedPreferences(data(), me(), { hidden: [...feedPreferences(data(), me()).hidden, id] }); ctx.closeModal(); ctx.toast('Hidden. You can restore hidden posts in Feed settings.'); }
    else if (act === 'wall-mute' || act === 'wall-unmute') { const prefs = feedPreferences(data(), me()); setFeedPreferences(data(), me(), { muted: act === 'wall-mute' ? [...prefs.muted, el.dataset.owner] : prefs.muted.filter(u => u !== el.dataset.owner) }); ctx.closeModal(); ctx.toast(act === 'wall-mute' ? 'Muted in your feed. Manage this in Feed settings.' : 'Unmuted.'); }
    else if (act === 'wall-reset-hidden') { setFeedPreferences(data(), me(), { hidden: [] }); ctx.closeModal(); }
    else return false;
    await ctx.persist(); ctx.render();
    if (activePost && !document.querySelector('#social-wall-comment')) activePost = null;
    return true;
  }
  async function submit(form) {
    if(await flow.submit(form))return true;
    if (form.id === 'social-wall-compose') {
      const format = form.elements.format.value;
      if (format === 'poll' && [0,1,2,3].filter(i => form.elements[`poll${i}`].value.trim()).length < 2) throw Error('Add at least two choices to your poll.');
      const attachment = ['text','poll','question'].includes(format) ? null : decodeAttachment(form.elements.attachment.value);
      if (['card','photo','collection'].includes(format) && !attachment) throw Error('Choose an attachment for your post.');
      publishPost(data(), me(), { text: form.elements.message.value, topic: form.elements.topic.value, audience: form.elements.audience.value, attachment, pollOptions: format === 'poll' ? [0,1,2,3].map(i => form.elements[`poll${i}`].value) : [], editId: form.dataset.editId || null, intent:format==='question'?'question':'post' });
      const editing=form.dataset.editId;
      if(!editing){setFeedPreferences(data(), me(), { mode: 'latest' });limit=6;topic='all';savedOnly=false;sort='recent';formatFilter='all';}
      composerOpen=false;composerDrafts.delete(composerKey);document.querySelector('#wall-inline-composer')?.remove();
      await ctx.persist();ctx.closeModal();ctx.ui().page='community';ctx.render();
      if(editing)document.querySelector('[data-post="'+CSS.escape(editing)+'"]')?.scrollIntoView({block:'center'});else window.scrollTo(0,0);
      ctx.toast(editing?'Your post is updated.':'Your post is ready for its people.');return true;
    }
    if (form.id === 'social-wall-comment') { const attachment=decodeAttachment(form.elements.recommendation?.value);commentOnPost(data(), me(), form.dataset.id, form.elements.comment.value.trim()||(attachment?'This one is worth a look.':''), replyTo,attachment); replyTo = null; commentDraft = ''; commentDrafts.delete(form.dataset.id);recommendationDrafts.delete(form.dataset.id); await ctx.persist(); showPost(form.dataset.id, true); return true; }
    if (form.id === 'social-feed-settings') { setFeedPreferences(data(), me(), { mode: form.elements.mode.value, topics: [...form.querySelectorAll('[name="topics"]:checked')].map(el => el.value) }); await ctx.persist(); ctx.closeModal(); limit = 6; savedOnly = false; ctx.render(); return true; }
    return false;
  }
  function change(el) {
    flow.change(el).catch(err=>ctx.toast(err.message));
    if(el.name==='recommendation'&&el.form?.id==='social-wall-comment'){recommendationDrafts.set(el.form.dataset.id,el.value);return;}
    if(el.id==='wall-sort'){sort=el.value;limit=6;ctx.render();return;}
    if(el.id==='wall-format'){formatFilter=el.value;limit=6;ctx.render();return;}
    if (el.id === 'wall-topic') { topic = el.value; limit = 6; ctx.render(); }
    if (!el.closest('#social-wall-compose')) return;
    if (el.name === 'format') {
      document.querySelector('#wall-compose-text').placeholder=el.value==='question'?'What would you love a recommendation for?':'What’s on your mind?';
      document.querySelectorAll('[data-social="wall-format"]').forEach(button=>{const active=button.dataset.format===el.value;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
      document.querySelector('#wall-attachment-field').hidden = ['text','poll','question'].includes(el.value);
      document.querySelector('#wall-poll-fields').hidden = el.value !== 'poll';
      el.form.elements.attachment.innerHTML = composerOptions(el.value);
      document.querySelector('#wall-compose-preview').innerHTML = '';
      updateComposerAudience();
    }
    if (el.name === 'attachment') { document.querySelector('#wall-compose-preview').innerHTML = attachmentHTML(ctx, decodeAttachment(el.value), me()); updateComposerAudience(); ctx.hydrate(); }
  }
  function input(el) { flow.input(el); if(el.matches('[data-recommendation-search]')){el.form.elements.recommendation.innerHTML=recommendationOptions(el.value);recommendationDrafts.delete(el.form.dataset.id);return;} if (el.id === 'wall-comment') { commentDraft = el.value; commentDrafts.set(activePost, el.value); } }
  function reset() { beforeRender();arrivalsOnly=false;composerOpen=false;sort="recent";formatFilter="all"; focusedPost = null; commentDrafts.clear();recommendationDrafts.clear(); activePost = null; replyTo = null; commentDraft = ''; topic = 'all'; limit = 6; savedOnly = false; }
  return { render, renderPosts, click, submit, change, input, reset, beforeRender, hydrate:flow.hydrate };
}
