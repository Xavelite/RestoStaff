import { createComputerUI, computerVisual } from './computer-ui.js';
import { createDemoSpace } from './demo-space.js';
import { APPEARANCES, appearanceId, appearanceSettings, nextDarkAppearance } from './appearance.js';
import { validLauncher, isExecutable, localFileType } from './local-items.js';
import { stopFlowMedia } from './flow-media.js';
import { upgradeFinalDemo, upgradeDocumentSample } from './final-demo.js';
import { createCompareUI } from './compare-ui.js';
import { EXTRA_WIDGETS, usefulWidgetFields, usefulWidgetBody, refreshUsefulWidgets, setUsefulWidgetNotifier, loadUsefulData, headlineFor, upgradeUsefulWidgets } from './useful-widgets.js';
import { personalCollections, toggleResourceFavorite, upgradeCollectionExperience } from './collection-experience.js';
import { liveCardActions, createCollectionExperienceUI } from './collection-experience-ui.js';
import { captureSuggestion } from './capture-intelligence.js';
import { upgradeResourceConnections } from './resource-connections.js';
import { upgradeCollaborativeCollections } from './collaborative-collections.js';
import { createHighlightsUI } from './highlights-ui.js';
import { upgradeDashboardHighlights, markFollowedResourceSeen } from './dashboard-highlights.js';
import { resourceKey } from './social.js';
import { contentDetailsFields, refreshDetailFields } from './content-details.js';
import { createSpaceTools } from './space-tools.js';
import { collectionEntries, upgradeConnectedSpace, markDiscoveriesSeen, markResourceSeen } from './smart-collections.js';
import { upgradeCommunityBrain, reconcileCommunityLibrary } from './community-brain.js';
import { createQuickSearch } from './quick-search.js';
import { upgradeDiscoveryCommunity, upgradePersonalOrganization } from "./community-seed.js";
import { upgradeStarterLibrary } from './starter-library.js';
import { ROOT_TOPICS, CONTENT_KINDS, subjectIds } from './topics.js';
import { contentFields, cleanTags, inCollection, matchResource, PROGRESS } from "./classification.js";
import { expandCatalog } from "./catalog.js";
import { VIEWS, SIZES, cardKind, cardSize, cardUnits, overviewCards, upgradePresentation } from "./layout.js";
import { createSocial, syncResources, canViewCard, searchCards, cardTopics, upgradeCommunity } from "./social.js";
import { createSocialUI } from "./social-ui.js";
import { upgradeNetwork } from "./network.js";
import { hydrateRails, scrollRail } from "./rails.js";
import { openPopover, closePopover } from "./surfaces.js";
import { upgradeLiveCollections } from "./live-collections.js";
import { mergeSocial } from "./state-merge.js";
import { migrateLocalAddress } from "./local-address.js";
import { fileKind, officePreview } from "./file-preview.js";
import { collectionQueue, audioCollectionQueue, nextQueueIndex } from "./playlist.js";
import {
  openYouTubeQueue,
  pauseYouTube,
  stopYouTube,
  playingYouTubeId,
  onYouTubeChange,
} from "./youtube-player.js";
import { icon } from "./icons.js";
import {
  seedState,
  uid,
  escapeHTML as esc,
  safeURL,
  isLocalAudioURL,
  metadata,
  domain,
  logoForURL,
  videoSource,
  TYPES,
  COLORS,
  WIDGETS,
  validateState,
  moveCard,
  matches,
  formatBytes,
} from "./model.js";
import {
  getState,
  saveState,
  getSocialState,
  saveSocialState,
  getFile,
  putFile,
  replaceAll,
  welcomeText,
} from "./storage.js";
import {
  widgetBody,
  weatherBody,
  refreshWeather,
  findCities,
  setWidgetNotifier,
  clockTime,
  clockDate,
  timerText,
  timerLabel,
  timerState,
  toggleTimer,
  resetTimer,
  clearTimers,
} from "./widgets.js";
import {
  playAudio,
  stopAudio,
  audioId,
  activeAudio,
  videoMarkup,
  audioEmbed,
  audioPlayback,
  advanceAudio,
  setAudioRepeat,
} from "./media.js";

const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
let spaceTools, highlightsUI, collectionExperienceUI, compareUI, computerUI;
let state, social, socialUI, quickSearch, sharedPlayback;
const ui = { page: "space", collection: "all", filter: "all", query: "", searchScope:"mine", mobile: false };
const overviewFolded = new Set();
const sidebarPositions = new Map();
const submittingForms = new WeakSet();
const sidebarNarrow = matchMedia("(max-width: 1100px)");
const sidebarDrawer = matchMedia("(max-width: 760px)");
const documentPreviews = new Map();
let saveChain = Promise.resolve();
let noteTimeout, toastTimeout, formTimer, cityTimer;
let draft = null,
  cityResults = [],
  drag = null,
  previewObjectURL = null;
let blockedDragCard = null, dragBlocked = false, suppressCardClickUntil = 0, dragFrame = null, dragPointer = null;
const typeNames = {
  link: "Website",
  file: "File",
  video: "Video",
  audio: "Music",
  widget: "Widget",
};
const typeIcons = {
  link: "globe",
  file: "file",
  video: "video",
  audio: "music",
  widget: "widget",
};
const widgetNames = {
  weather: "Weather",
  clock: "Clock",
  note: "Quick note",
  focus: "Focus timer",
  tasks: "Small tasks",
  continue: "Continue & revisit",
  updates: "From my people",
  ...Object.fromEntries(Object.entries(EXTRA_WIDGETS).map(([k,v])=>[k,v.name])),
};
const widgetDescriptions = {
  weather: "A glance at the skies",
  clock: "Keep your time close",
  note: "Catch a passing thought",
  focus: "Make a little room to focus",
  tasks: "A few things to get done",
  continue: "Recent cards and the things you marked for later",
  updates: "Recent finds from people and collections you follow",
  ...Object.fromEntries(Object.entries(EXTRA_WIDGETS).map(([k,v])=>[k,v.description])),
};
const widgetColors = {
  weather: "blue",
  clock: "sage",
  note: "amber",
  focus: "rose",
  tasks: "sage",
  continue: "violet",
  updates: "blue",
  ...Object.fromEntries(Object.entries(EXTRA_WIDGETS).map(([k,v])=>[k,v.color])),
};

function button(action, label, ico, extra = "", cls = "icon-btn") {
  return `<button type="button" class="${cls}" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon(ico)}</button>`;
}
function cardById(id) {
  return state.cards.find((c) => c.id === id) || sharedPlayback?.cards.find((c) => c.id === id);
}
function collectionById(id) {
  return state.collections.find((c) => c.id === id);
}
function collectionOptions(selected, includeNew = false) {
  return (
    state.collections.filter(c=>c.system!=='favorites'||c.id===selected)
      .map(
        (c) =>
          `<option value="${esc(c.id)}" ${selected === c.id ? "selected" : ""}>${esc(c.name)}</option>`,
      )
      .join("") +
    (includeNew
      ? '<option value="__new">＋ Create a new collection</option>'
      : "")
  );
}
function setSaveLabel(message, error = false) {
  const n = document.querySelector("#save-status");
  if (n) {
    n.classList.toggle("error", error);
    n.innerHTML = `<span class="status-dot"></span>${esc(message)}`;
  }
}
let persistenceBase = null, saveSequence = 0;
function persist() {
  for (const c of state.collections) c.visibility ??= "private";
  for (const c of state.cards) c.visibility ??= c.fileId || c.widget === "note" ? "private" : "inherit";
  social.spaces[social.activeUser] = state;
  reconcileCommunityLibrary(social);
  if (social.activeUser === "xavier") social.profiles.xavier.name = state.settings.name;
  syncResources(social);
  const snapshot = structuredClone(social);
  const base = persistenceBase;
  persistenceBase = snapshot;
  const sequence = ++saveSequence;
  setSaveLabel("Saving your space…");
  saveChain = saveChain.catch(() => {}).then(() => saveSocialState(snapshot, base)).then(merged => {
    if (sequence === saveSequence) {
      const active = social.activeUser;
      social = mergeSocial(snapshot, social, merged);
      social.activeUser = active;
      state = social.spaces[active];
      persistenceBase = structuredClone(merged);
    }
    return merged;
  });
  return saveChain.then(
    () => setSaveLabel("Saved in this browser"),
    (err) => {
      setSaveLabel("Not saved · storage unavailable", true);
      throw Error(
        "Your changes could not be saved. Browser storage may be full. Your changes are still visible in this tab.",
      );
    },
  );
}
function toast(message, undo) {
  const el = document.querySelector("#toast");
  clearTimeout(toastTimeout);
  el.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  el.append(text);
  if (undo) {
    const b = document.createElement("button");
    b.textContent = "Undo";
    b.onclick = () => {
      undo();
      el.classList.remove("visible");
    };
    el.append(b);
  }
  el.classList.add("visible");
  toastTimeout = setTimeout(
    () => el.classList.remove("visible"),
    undo ? 9000 : 4300,
  );
}
function restoreSnapshot(snapshot) {
  state = snapshot;
  render();
  persist().catch((e) => toast(e.message));
}
async function mutate(fn, message, undo = false) {
  const previous = undo ? structuredClone(state) : null;
  fn();
  await persist();
  render();
  if (message) toast(message, undo ? () => restoreSnapshot(previous) : null);
}
function filteredCards() {
  return state.cards.filter((c) => {
    if (ui.collection === "favorites" && !c.favorite) return false;
    if (
      !["all", "favorites"].includes(ui.collection) &&
      !inCollection(c, ui.collection)
    )
      return false;
    if (ui.filter === "picture") {
      if (
        c.type !== "file" ||
        fileKind(c.fileName || c.url, c.mime).label !== "Photo"
      )
        return false;
    } else if (ui.filter !== "all" && c.type !== ui.filter) return false;
    const labels=state.collections.filter(col=>inCollection(c,col.id)).map(col=>col.name).join(' ');
    return matchResource(c,ui.query,labels+' '+cardTopics(state,c).join(' ')+' '+(c.widget||''),true).matches;
  });
}
function sidebarMode() {
  return state.settings.sidebarMode || (state.settings.sidebarCollapsed ? "compact" : "auto");
}
function sidebarIsCompact() {
  return !sidebarDrawer.matches && (sidebarMode() === "compact" || (sidebarMode() === "auto" && sidebarNarrow.matches));
}
function syncSidebar() {
  const sidebar = document.querySelector("#main-sidebar");
  if (!sidebar) return;
  const drawer = sidebarDrawer.matches, open = drawer && ui.mobile, compact = sidebarIsCompact();
  document.body.classList.toggle("sidebar-collapsed", compact);
  document.body.classList.toggle("navigation-open", open);
  sidebar.classList.toggle("open", open);
  sidebar.inert = drawer && !open;
  document.querySelector(".mobile-overlay")?.classList.toggle("open", open);
  document.querySelectorAll('.app-shell > :not(.sidebar):not(.mobile-overlay)').forEach(el => { el.inert = open; });
  document.querySelector("#youtube-host").inert = open;
  const toggle = sidebar.querySelector(".sidebar-collapse");
  const label = drawer ? "Close navigation" : compact ? "Expand sidebar" : "Collapse sidebar";
  toggle.setAttribute("aria-label", label); toggle.title = label;
  toggle.setAttribute("aria-expanded", String(drawer ? open : !compact));
  toggle.innerHTML = icon(drawer ? "close" : "sidebar");
  const opener = document.querySelector('[data-action="toggle-sidebar"]');
  opener?.setAttribute("aria-expanded", String(open));
}
function closeSidebarDrawer(restoreFocus = false) {
  ui.mobile = false; syncSidebar();
  if (restoreFocus) document.querySelector('[data-action="toggle-sidebar"]')?.focus();
}
for (const media of [sidebarNarrow, sidebarDrawer]) media.addEventListener("change", () => {
  if (!state) return;
  const wasFocused = document.querySelector("#main-sidebar")?.contains(document.activeElement);
  ui.mobile = false; syncSidebar();
  if (sidebarDrawer.matches && wasFocused) document.querySelector('[data-action="toggle-sidebar"]')?.focus();
});
function collectionNav(c) {
  const fresh=collectionEntries(social,social.activeUser,c).filter(e=>e.isNew).length;
  return `<button class="nav-item collection-nav tint-${c.color} ${ui.page==='space'&&ui.collection===c.id?'active':''}" data-action="navigate" data-id="${esc(c.id)}" data-drop-collection="${esc(c.id)}" title="${esc(c.name)}"><span class="collection-dot"></span><span class="collection-mini" aria-hidden="true">${icon(c.icon||'collection')}</span><span class="nav-title">${esc(c.name)}</span>${fresh?`<span class="nav-new" title="${fresh} new discoveries" aria-label="${fresh} new discoveries"></span>`:""}<span class="count">${c.smart?.enabled?collectionEntries(social,social.activeUser,c).length:state.cards.filter(card=>inCollection(card,c.id)).length}</span></button>`;
}
function organizedNavigation() {
  if(!state.settings.groupCollections)return personalCollections(state).map(collectionNav).join('');
  const folders=state.folders||[];
  return personalCollections(state).filter(c=>!folders.some(f=>f.id===c.folderId)).map(collectionNav).join('')+folders.map(folder=>`<div class="sidebar-folder"><div class="folder-heading"><button data-action="folder-fold" data-id="${esc(folder.id)}" aria-expanded="${!folder.collapsed}" title="${esc(folder.name)}">${icon('collection')}<span>${esc(folder.name)}</span>${icon('down')}</button>${button('folder-menu','Options for folder '+folder.name,'more',`data-id="${esc(folder.id)}"`)}</div>${folder.collapsed?'':`<div class="folder-collections">${personalCollections(state).filter(c=>c.folderId===folder.id).map(collectionNav).join('')||'<small class="folder-empty">Choose this folder when editing a collection.</small>'}</div>`}</div>`).join('')+
  (state.savedSearches?.length?'<div class="sidebar-subtitle">SMART COLLECTIONS</div>'+state.savedSearches.map(saved=>`<div class="smart-nav"><button class="nav-item" data-social="saved-search" data-id="${esc(saved.id)}" title="${esc(saved.name)}">${icon('search')}<span>${esc(saved.name)}</span></button><button class="icon-btn" data-social="remove-saved-search" data-id="${esc(saved.id)}" aria-label="Remove smart collection ${esc(saved.name)}">${icon('close')}</button></div>`).join(''):'');
}
function folderOptions(selected) { return '<option value="">No folder</option>'+(state.folders||[]).map(f=>`<option value="${esc(f.id)}" ${selected===f.id?'selected':''}>${esc(f.name)}</option>`).join('')+'<option value="__new">＋ New folder</option>'; }
function subjectOptions(selected='') { return '<option value="">Not specified</option>'+ROOT_TOPICS.map(root=>`<optgroup label="${esc(root.label)}"><option value="${root.id}" ${selected===root.id?'selected':''}>All ${esc(root.label.toLowerCase())}</option>${root.children.map(t=>`<option value="${t.id}" ${selected===t.id?'selected':''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join(''); }
function organizationFields(card) {
  const fields=contentFields(card);
  return `<details class="card-classification"><summary>${icon('bookmark')}Topics, tags & details</summary><div class="field-row"><label class="field">Topic<select name="primarySubject">${subjectOptions(card.primarySubject??subjectIds(card)[0])}</select></label><label class="field">Content kind<select name="contentKind"><option value="">Not specified</option>${Object.entries(CONTENT_KINDS).map(([id,label])=>`<option value="${id}" ${card.contentKind===id?'selected':''}>${label}</option>`).join('')}</select></label></div><label class="field">Also belongs to <small>(optional)</small><select name="secondarySubject">${subjectOptions(card.secondarySubject??subjectIds(card)[1])}</select></label><label class="field">Author, maker, or publisher<input name="creator" maxlength="100" value="${esc(card.creator||'')}" placeholder="If known"></label><p class="form-hint">Topics help shared cards appear in community searches and smart collections. Tags below stay personal.</p><label class="field">Private tags<input name="tags" value="${esc((Array.isArray(card.tags)?card.tags:cleanTags(card.tags)).join(', '))}" placeholder="relaxing, road trip, favorites"><small>Separate with commas. Tags are for your own searches.</small></label><label class="field">My progress<select name="progress">${Object.entries(PROGRESS).map(([value,label])=>`<option value="${value}" ${card.progress===value?'selected':''}>${label}</option>`).join('')}</select></label>${contentDetailsFields(card)}</details>`;
}
function organizeCard(id) {
  const card=cardById(id);if(!card)return;
  modal('One card. More than one home.',card.title,`<form id="organize-card-form" data-id="${esc(id)}"><div class="placement-list">${state.collections.filter(c=>c.system!=='favorites'||c.id===card.collectionId).map(c=>`<label><input type="checkbox" name="placements" value="${esc(c.id)}" ${inCollection(card,c.id)?'checked':''} ${card.collectionId===c.id?'disabled':''}><span>${esc(c.name)}${card.collectionId===c.id?' <small>Home collection</small>':''}</span></label>`).join('')}</div><p class="form-hint">Extra placements reference this same card. Its home collection still controls the widest audience; private cards stay private.</p>${organizationFields(card)}<div id="form-error" role="alert"></div></form>`,cancelButton+'<button class="primary" type="submit" form="organize-card-form">Save organization</button>');
}
function renderSidebar() {
  return `<div class="mobile-overlay ${ui.mobile ? "open" : ""}" data-action="close-sidebar"></div><aside id="main-sidebar" class="sidebar ${ui.mobile ? "open" : ""}" aria-label="Main navigation" data-profile-id="${esc(social.activeUser)}">
    <div class="sidebar-brand"><a class="brand" href="#" data-action="home" aria-label="Universal home"><span class="brand-mark">u</span><span class="brand-word">universal</span></a><button class="icon-btn sidebar-collapse" data-action="collapse-sidebar" aria-label="${sidebarIsCompact() ? "Expand" : "Collapse"} sidebar" aria-expanded="${!sidebarIsCompact()}" title="${sidebarIsCompact() ? "Expand" : "Collapse"} sidebar">${icon("sidebar")}</button></div>
    ${socialUI.switchButton()}
    <nav><button class="nav-item ${ui.page === "space" && ui.collection === "all" ? "active" : ""}" data-action="navigate" data-id="all" title="My dashboard">${icon("grid")}<span>My dashboard</span><span class="count">${state.cards.length}</span></button><button class="nav-item ${ui.page === "space" && ui.collection === "favorites" ? "active" : ""}" data-action="navigate" data-id="favorites" title="Favorites">${icon("star")}<span>Favorites</span><span class="count">${state.cards.filter((c) => c.favorite).length}</span></button></nav>
    ${socialUI.navigation()}
    <div class="nav-label"><span>COLLECTIONS</span>${button("organize-collections", "Organize collections", "settings")}${button("add-collection", "New collection", "plus")}</div>
    <nav id="collection-nav">${organizedNavigation()}${socialUI.liveNavigation()}</nav>
    <div class="sidebar-bottom"><button class="nav-item" data-action="space-menu" aria-label="Space tools and help" aria-haspopup="dialog" aria-expanded="false" title="Space tools and help">${icon("settings")}<span>Tools & settings</span>${icon("more")}</button><div id="save-status" class="local-status"><span class="status-dot"></span>Saved in this browser</div></div>
  </aside>`;
}
function renderTop({ scope = ui.searchScope || "mine", query = ui.query, searchId = "search" } = {}) {
  const profile = social.profiles[social.activeUser];
  const collection = ui.page === "space" && scope === "mine" ? collectionById(ui.collection) : null;
  const placeholder = scope !== "mine" ? "Discover something worth keeping…" : collection ? `Find something in ${collection.name}…` : ui.collection === "favorites" ? "Find a favorite…" : "Find something in your space…";
  return `<header class="topbar universal-topbar">${button("toggle-sidebar", "Open navigation", "menu", 'aria-controls="main-sidebar" aria-expanded="false"', "icon-btn mobile-menu")}<form class="universal-search" id="global-search-form"><label class="searchbox">${icon("search")}<input id="${searchId}" type="search" placeholder="${esc(placeholder)}" aria-label="${scope === "mine" ? "Search your dashboard" : "Search shared cards, collections, and people"}" value="${esc(query)}" autocomplete="off" aria-controls="instant-results" aria-expanded="false" aria-haspopup="dialog"><kbd ${query ? "hidden" : ""}>/</kbd></label><button type="button" class="icon-btn search-clear" data-action="clear-search" aria-label="Clear search" title="Clear search" ${query ? "" : "hidden"}>${icon("close")}</button><select id="universal-scope" aria-label="Search in"><option value="mine" ${scope === "mine" ? "selected" : ""}>My space</option><option value="friends" ${scope === "friends" ? "selected" : ""}>Friends</option><option value="everyone" ${scope === "everyone" ? "selected" : ""}>Everyone</option></select><button class="search-submit icon-btn" aria-label="Search" type="submit">${icon("arrow")}</button><section id="instant-results" class="instant-results" role="dialog" aria-label="Live search results" hidden></section></form><div class="topbar-right">${socialUI.bell()}${button("theme", "Choose color theme", "spark", 'aria-haspopup="dialog" aria-expanded="false"', "icon-btn theme-top")}<button class="profile-switch-small" data-social="page" data-page="profile" aria-label="My profile"><span class="social-avatar tint-${profile.color}">${esc(profile.name.slice(0,1))}</span></button><button class="primary" data-action="add-card">${icon("plus")}<span>Add card</span></button></div></header>`;
}
function renderGreeting() {
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const collection = collectionById(ui.collection);
  const title =
    ui.collection === "favorites"
      ? "The things you come back to."
      : collection
        ? collection.name
        : state.settings.title;
  const subtitle =
    ui.collection === "favorites"
      ? "A little less searching for your favorite things."
      : collection
        ? collection.description
        : state.settings.subtitle;
  const heading = esc(title).replace(/universe\./i, '<span class="universe-word">universe.</span>');
  return `<section class="greeting ${collection ? "collection-greeting" : ""}"><div class="hero-orbit" aria-hidden="true"></div><div class="greeting-date">${collection ? `<button data-action="home">My dashboard</button>${icon("chevron")}<span>Collection</span>` : `<span>${esc(date)}</span>`}</div><h1>${heading}</h1><p>${esc(subtitle)}</p><button class="greeting-personalize" data-action="${collection ? "edit-collection" : "settings"}" ${collection ? `data-id="${esc(collection.id)}"` : ""}>${icon("spark")}${collection ? "Edit collection" : "Make it yours"}</button></section>`;
}
function renderToolbar() {
  const overview = ui.collection === "all" && !ui.query && ui.filter === "all";
  const countCollection=collectionById(ui.collection);
  const cardCount=countCollection?.smart?.enabled?collectionEntries(social,social.activeUser,countCollection).length:state.cards.filter(c=>ui.collection==='all'||(ui.collection==='favorites'&&c.favorite)||inCollection(c,ui.collection)).length;
  const allFolded = state.collections.length > 0 && state.collections.every(c => overviewFolded.has(c.id));
  return `<div class="toolbar"><div class="filters" role="group" aria-label="Filter by card type">${[
    ["all", "All cards", "grid"],
    ["link", "Links", "globe"],
    ["file", "Files", "file"],
    ["picture", "Pictures", "image"],
    ["video", "Videos", "video"],
    ["audio", "Music", "music"],
    ["widget", "Widgets", "widget"],
  ]
    .map(
      ([type, label, ico]) =>
        `<button class="filter ${ui.filter === type ? "active" : ""}" data-action="filter" data-id="${type}" aria-pressed="${ui.filter === type}">${type !== "all" ? icon(ico) : ""}${label}${type === "all" ? `<span class="filter-count">${cardCount}</span>` : ""}</button>`,
    )
    .join(
      "",
    )}</div><div class="view-controls">${ui.collection === "all" && state.collections.length ? button("collapse-all", `${allFolded ? "Expand" : "Collapse"} all collections`, "down", `aria-expanded="${!allFolded}" ${overview ? "" : "hidden"}`, `icon-btn fold-all ${allFolded ? "all-folded" : ""}`) : ""}<label class="layout-select">${icon(state.settings.view === "list" ? "list" : "grid")}<select id="dashboard-view" aria-label="Dashboard layout">${Object.entries(VIEWS).map(([value,label]) => `<option value="${value}" ${state.settings.view === value ? "selected" : ""}>${label}</option>`).join("")}</select></label></div></div>`;
}
function cardInfo(c) {
  const book = c.contentKind === 'book' && c.type === 'link';
  const subtitle = book ? c.creator || 'Book' : c.description || domain(c.url) || c.fileName || typeNames[c.type];
  return `<div class="card-info"><div class="card-title" title="${esc(c.title)}">${esc(c.title)}</div><div class="card-description">${esc(subtitle)}</div>${book ? '<span class="book-format">Read online ' + icon('arrow') + '</span>' : ''}</div>`;
}
function cardVisual(c) {
  const localVisual=computerVisual(c);if(localVisual)return localVisual;
  if(c.contentKind==='book'&&c.type==='link')return `<div class="card-visual book-visual"><span class="book-cover">${icon('book')}<strong>${esc(c.title)}</strong><small>${esc(c.creator||'')}</small></span><span class="file-badge">EBOOK LINK</span></div>`;

  if (c.type === "widget") return `<div class="card-visual shared-widget-symbol">${icon(typeIcons.widget)}</div>`;
  if (c.type === "link") {
    const host = domain(c.url);
    return `<div class="card-visual"><div class="visual-grid"></div><div class="brand-halo"></div><img class="brand-logo" src="${esc(logoForURL(c.url))}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="logo-fallback" hidden>${icon("globe")}</span><span class="card-domain">${esc(host)}</span></div>`;
  }
  if (c.type === "video") {
    const v = videoSource(c.url);
    return `<div class="card-visual video-art">${v?.provider === "youtube" ? `<img class="thumbnail" src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy">` : `<div class="flower" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<span class="petal" style="transform:rotate(${i * 60}deg)"></span>`).join("")}<span class="flower-center"></span></div>`}<span class="play-circle">${icon("play")}</span></div>`;
  }
  if (c.type === "audio")
    return `<div class="card-visual audio-art"><div class="visual-grid"></div><div class="vinyl"></div><span class="audio-source">${audioEmbed(c.url) ? "SPOTIFY" : c.fileId ? "AUDIO FILE" : "AUDIO LINK"}</span><span class="play-circle" data-audio-icon="${esc(c.id)}">${icon(audioId() === c.id && !activeAudio?.paused ? "pause" : "play")}</span><div class="audio-progress" data-audio-progress="${esc(c.id)}"></div></div>`;
  const kind = fileKind(c.fileName || c.url, c.mime);
  if (kind.label === "Photo")
    return `<div class="card-visual photo-art"><img class="thumbnail" ${c.fileId ? `data-photo-id="${esc(c.fileId)}"` : `src="${esc(c.url)}"`} alt="${esc(c.title)}" loading="lazy"><span class="file-badge">PHOTO</span></div>`;
  return `<div class="card-visual document-art document-${kind.family}" aria-label="${esc(kind.label)}"><div class="document-symbol" aria-hidden="true"><div class="document-sheet"><span></span><span></span><span></span></div><strong class="document-mark ${kind.mark.length > 1 ? "small-mark" : ""}">${esc(kind.mark)}</strong></div><span class="document-kind">${esc(kind.short)}</span><span class="file-badge">${esc((kind.ext || "FILE").toUpperCase().slice(0, 8))}</span></div>`;
}
function dashboardWidget(card) {
  if(EXTRA_WIDGETS[card.widget])return usefulWidgetBody(card,state);
  if(card.widget==='tasks') return `<div class="widget-eyebrow">${icon('check')}<span>${esc(card.title)}</span></div><div class="task-items">${(card.tasks||[]).map(task=>`<label><input type="checkbox" data-task-card="${esc(card.id)}" data-task-id="${esc(task.id)}" ${task.done?'checked':''}><span>${esc(task.text)}</span><button class="icon-btn" data-action="remove-task" data-id="${esc(card.id)}" data-task-id="${esc(task.id)}" aria-label="Remove task ${esc(task.text)}">${icon('close')}</button></label>`).join('')||'<p>A little space for your next step.</p>'}</div><form class="widget-task-form" data-card-id="${esc(card.id)}"><input name="task" aria-label="New task in ${esc(card.title)}" placeholder="Add a small task…" maxlength="120" required><button type="submit" aria-label="Add task">${icon('plus')}</button></form>`;
  if(card.widget==='continue') {
    const recent=(state.recentCards||[]).map(r=>({r,card:state.cards.find(c=>c.id===r.id)})).filter(e=>e.r.owner===social.activeUser&&e.card).map(e=>e.card);
    const marked=state.cards.filter(c=>c.type!=='widget'&&['later','active'].includes(c.progress)).sort((a,b)=>(b.progress==='active')-(a.progress==='active'));
    const cards=[...new Map([...marked,...recent].filter(c=>canViewCard(social,social.activeUser,c,social.activeUser)).map(c=>[c.id,c])).values()].slice(0,4);
    return `<div class="widget-eyebrow">${icon('bookmark')}<span>${esc(card.title)}</span></div><div class="discovery-widget-items">${cards.map(c=>`<button data-action="open-card" data-id="${esc(c.id)}"><span>${icon(typeIcons[c.type])}</span><span><strong>${esc(c.title)}</strong><small>${["later","active"].includes(c.progress)?PROGRESS[c.progress]:"Recently opened"}</small></span>${icon('arrow')}</button>`).join('')||'<p>Open a card, or mark one For later. It will be waiting here.</p>'}</div>`;
  }
  if(card.widget==='updates') {
    const results=searchCards(social,social.activeUser,{followingOnly:true,sort:'recent'}).slice(0,3);
    return `<div class="widget-eyebrow">${icon('compass')}<span>${esc(card.title)}</span></div><div class="discovery-widget-items">${results.map(r=>`<button data-social="detail" data-owner="${esc(r.ownerId)}" data-card-id="${esc(r.card.id)}"><span>${icon(typeIcons[r.card.type]||'globe')}</span><span><strong>${esc(r.card.title)}</strong><small>${esc(social.profiles[r.ownerId].name)}</small></span>${icon('arrow')}</button>`).join('')||'<p>Follow a person or a living collection to see their recent discoveries.</p>'}</div>`;
  }
  return widgetBody(card);
}
function renderCard(c, collection = collectionById(c.collectionId), isNew=false) {
  if (!canViewCard(social, social.activeUser, c, social.activeUser)) return `<article class="card unavailable-card" data-card="${esc(c.id)}"><div>${icon("lock")}<strong>Sharing has changed</strong><p>This saved file is no longer shared with you.</p>${button("card-menu", "Options for unavailable card", "more", `data-id="${esc(c.id)}"`)}</div></article>`;
  const extras = `data-id="${esc(c.id)}"`;
  const reference = collection && c.collectionId !== collection.id;
  const presentation = `data-kind="${cardKind(c)}" data-size="${cardSize(c, collection)}" style="--card-units:${cardUnits(c, collection)}"`;
  const actions = `${socialUI.ownCardTools(c)}<div class="card-actions">${button("card-menu", `Options for ${c.title}`, "more", extras)}</div>`;
  const footer = `<div class="card-action-bar live-member-actions">${liveCardActions(social,social.activeUser,social.activeUser,c,{personal:true})}</div>`;
  if (c.type === "widget")
    return `<article class="card widget-card tint-${c.color}" ${presentation} data-widget-type="${esc(c.widget)}" data-card="${esc(c.id)}" data-collection="${esc(collection?.id || c.collectionId)}" draggable="${!reference}" aria-label="${esc(c.title)} widget">${actions}<div class="widget-content" data-widget="${esc(c.id)}">${dashboardWidget(c)}</div>${footer}</article>`;
  return `<article class="card tint-${c.color} ${isNew?"is-arrival is-new":""} ${c.type === "audio" ? "audio-card" : ""} ${audioId() === c.id && !activeAudio?.paused ? "playing" : ""}" ${presentation} data-card="${esc(c.id)}" data-collection="${esc(collection?.id || c.collectionId)}" draggable="${!reference}">${isNew?`<span class="personal-arrival-label">${icon("spark")}New</span>`:""}${actions}<button class="card-main" draggable="${!reference}" title="${reference ? "Also saved in this collection" : "Click to open · Drag to arrange"}" data-action="open-card" ${extras} aria-label="${c.launcher ? "Launch" : c.type === "audio" ? "Play" : c.type === "video" ? "Watch" : c.type === "file" ? "Preview" : "Open"} ${esc(c.title)}">${cardVisual(c)}${cardInfo(c)}</button>${footer}</article>`;
}
function smartEntries(collection) {
  return collectionEntries(social,social.activeUser,collection).filter(e=> {
    if(ui.collection==='favorites'&&(!e.card.favorite||e.dynamic))return false;
    if(ui.filter==='picture' ? cardKind(e.card)!=='picture' : ui.filter!=='all'&&e.card.type!==ui.filter)return false;
    return matchResource(e.card,ui.query,collection.name+' '+cardTopics(social.spaces[e.owner],e.card).join(' '),e.owner===social.activeUser).matches;
  });
}
function renderDiscovery(entry,collection) {
  const c=entry.card,extra=`data-id="${esc(collection.id)}" data-key="${esc(entry.key)}"`;
  return `<article class="card smart-discovery live-member ${entry.isNew?'is-new ':''}tint-${esc(c.color||'sage')}" data-kind="${cardKind(c)}" data-size="${cardSize(c,collection)}" style="--card-units:${cardUnits(c,collection)}">${entry.isNew?'<span class="smart-card-label">'+icon('spark')+'New</span>':''}<button class="icon-btn smart-hide" data-action="live-card-menu" ${extra} aria-label="Options for ${esc(c.title)}">${icon('more')}</button><button class="card-main" data-action="smart-open" ${extra} aria-label="Open ${esc(c.title)}">${cardVisual(c)}${cardInfo(c)}</button><div class="smart-card-footer live-member-actions card-action-bar">${liveCardActions(social,social.activeUser,entry.owner,c)}</div></article>`;
}
function collectionPlaybackCards(id) {
 const col=collectionById(id);if(!col)return [];
 const cards=collectionEntries(social,social.activeUser,col).map(e=>({...e.card,id:e.dynamic?'smart:'+e.owner+':'+e.card.id:e.card.id,collectionId:id,sourceRef:{owner:e.owner,id:e.card.id}}));
 sharedPlayback={owner:social.activeUser,cards};return cards;
}

function renderSections() {
  if(ui.collection==='favorites'){
    const favorites=filteredCards();
    return favorites.length?'<section class="collection-section"><div class="cards-grid full-grid">'+favorites.map(c=>renderCard(c)).join('')+'</div></section>':'<div class="empty-state">'+icon('star')+'<h2>Keep your favorites close.</h2><p>Star a card anywhere. Your personal bookmark stays here when a live collection changes.</p></div>';
  }
  const visible = filteredCards();
  const entries=new Map(state.collections.map(c=>[c.id,smartEntries(c)]));
  const visibleCount=[...new Set([...entries.values()].flat().map(e=>e.key))].length;
  const overview = ui.collection === "all" && !ui.query && ui.filter === "all";
  const selected = personalCollections(state).filter((c) =>
    (["all", "favorites"].includes(ui.collection) || c.id === ui.collection) &&
    (overview || entries.get(c.id).length || c.id === ui.collection));
  const constrained = !!ui.query || ui.filter !== "all";
  const bookmarkMatches=constrained&&ui.collection==='all'?visible.filter(c=>collectionById(c.collectionId)?.system==='favorites'):[];
  const bookmarkSection=bookmarkMatches.length?'<section class="collection-section"><div class="section-heading"><h2 class="section-title">Favorites</h2></div><div class="cards-grid full-grid">'+bookmarkMatches.map(c=>renderCard(c)).join('')+'</div></section>':'';
  const summary = constrained ? `<div class="filter-summary"><span role="status">${visibleCount} ${visibleCount === 1 ? "card" : "cards"}${ui.query ? ` for “${esc(ui.query)}”` : ""}${ui.filter !== "all" ? ` · ${({link:"Links",file:"Files",picture:"Pictures",video:"Videos",audio:"Music",widget:"Widgets"})[ui.filter]}` : ""}</span><button class="text-btn" data-action="clear-filters">${icon("close")}Clear filters</button></div>` : "";
  if (constrained && !visibleCount) return summary + `<div class="empty-state">${icon("search")}<h2>No cards match just yet.</h2><p>Try another word or clear your filters${collectionById(ui.collection) ? ` to see everything in ${esc(collectionById(ui.collection).name)}` : ""}.</p></div>`;
  if (!selected.length&& !bookmarkMatches.length) return `<div class="empty-state">${icon(ui.collection === "favorites" ? "star" : "collection")}<h2>${ui.collection === "favorites" ? "Keep your favorites close." : "A little room for something new."}</h2><p>${ui.collection === "favorites" ? "Star a card to find it here whenever you need it." : "Add your first card to make this space yours."}</p><button class="secondary" data-action="${ui.collection === "favorites" ? "home" : "add-card"}">${ui.collection === "favorites" ? "Browse my dashboard" : "Add a card"}</button></div>`;
  return summary + bookmarkSection + selected.map((collection) => {
    const items=entries.get(collection.id);
    const cards = items.map(e=>e.card);
    const shown = cards;
    const folded = overview && overviewFolded.has(collection.id);
    const units = Math.max(1, shown.reduce((n,c) => n + cardUnits(c,collection),0));
    const queue = cards.filter(c=>c.type==='video'&&videoSource(c.url)?.provider==='youtube');
    const audioQueue = cards.filter(c=>c.type==='audio');
    return `<section class="collection-section tint-${collection.color} ${folded ? "is-collapsed" : ""}" data-section="${esc(collection.id)}" data-drop-collection="${esc(collection.id)}"><div class="section-heading"><h2 class="section-title">${overview ? `<button class="collection-heading-button" data-action="collapse" data-id="${esc(collection.id)}" aria-expanded="${!folded}" aria-controls="collection-cards-${esc(collection.id)}" title="${folded ? "Expand" : "Collapse"} ${esc(collection.name)}"><span class="section-icon">${icon(collection.icon)}</span><span>${esc(collection.name)}</span></button>` : `<span class="collection-heading-label"><span class="section-icon">${icon(collection.icon)}</span><span>${esc(collection.name)}</span></span>`}</h2><span class="section-count">${cards.length}</span>${items.some(e=>e.isNew)?`<button class="new-arrival-count" data-action="show-new-arrival" data-id="${esc(collection.id)}">${items.filter(e=>e.isNew).length} new</button>`:""}<span class="section-description">${esc(collection.description)}</span><div class="section-actions">${collection.smart?.enabled?`<button class="smart-badge automatic-updates" data-action="smart-pause" data-id="${esc(collection.id)}" role="switch" aria-checked="${!collection.smart.paused}" title="Turn automatic updates ${collection.smart.paused?"on":"off"}">${icon(collection.smart.paused?"pause":"repeat")}Updates ${collection.smart.paused?"off":"on"}</button>`:""}${socialUI.collectionTools(collection)}${!overview && audioQueue.length ? `<button class="collection-play" data-action="play-audio-collection" data-id="${esc(collection.id)}">${icon("music")}<span>Play music</span></button>` : ""}${!overview && queue.length ? `<button class="collection-play" data-action="play-collection" data-id="${esc(collection.id)}">${icon("play")}<span>Play videos</span></button>` : ""}${button("collection-menu", `Options for ${collection.name}`, "more", `data-id="${esc(collection.id)}"`)}${overview && !folded && cards.length ? `<span class="rail-buttons"><button class="icon-btn" data-action="scroll-rail" data-direction="-1" aria-label="Scroll ${esc(collection.name)} left">${icon("chevron")}</button><button class="icon-btn" data-action="scroll-rail" data-direction="1" aria-label="Scroll ${esc(collection.name)} right">${icon("chevron")}</button></span>` : ""}${overview ? `<button class="see-all" data-action="navigate" data-id="${esc(collection.id)}" aria-label="See all ${cards.length} cards in ${esc(collection.name)}">See all ${icon("arrow")}<span class="sr-only">${cards.length} cards</span></button>` : button("add-card", `Add to ${collection.name}`, "plus", `data-collection-id="${esc(collection.id)}"`)}${overview ? button("collapse", `${folded ? "Expand" : "Collapse"} ${collection.name}`, "down", `data-id="${esc(collection.id)}" aria-expanded="${!folded}"`, "icon-btn collapse-button") : ""}</div></div>${!folded&&!overview&&collection.smart?.enabled?`<div class="smart-shelf-bar"><span>${icon("spark")}${collection.smart.paused?"Updates off · your current selection stays":"Ready to use · new matches join automatically"} · ${cards.length} cards</span>${items.some(e=>e.isNew)?`<button class="text-btn" data-action="arrival-motion">${state.dashboard?.pauseMotion?"Resume":"Pause"} animation</button><button class="text-btn" data-action="smart-mark-seen" data-id="${esc(collection.id)}">Mark seen</button>`:""}<button class="text-btn" data-action="smart-settings" data-id="${esc(collection.id)}">Edit rules</button></div>`:""}${folded ? `<div id="collection-cards-${esc(collection.id)}" hidden></div>` : `<div id="collection-cards-${esc(collection.id)}" class="cards-grid ${overview ? "overview-grid collection-rail" : "full-grid"} ${shown.every(c => cardSize(c,collection) === "compact") ? "shortcuts-row" : ""}" style="--overview-units:${units}" ${overview ? `data-rail="${esc(social.activeUser)}:${esc(collection.id)}" tabindex="0" role="region" aria-label="Cards in ${esc(collection.name)}"` : ""}>${shown.length ? items.map(e => e.dynamic?renderDiscovery(e,collection):renderCard(e.card,collection,e.isNew)).join("") : `<div class="empty-collection">${icon("plus")}<button data-action="add-card" data-collection-id="${esc(collection.id)}">Add your first card, or drop one here.</button></div>`}</div>`}${!overview&&!folded&&!constrained?collectionExperienceUI.render(collection):""}</section>`;
  }).join("") + (overview ? '<button class="add-collection-tile" data-action="add-collection">'+icon("plus")+'A new collection. A little more possibility.</button>' : "");
}

function render() {
  const oldNav = document.querySelector("#collection-nav");
  if (oldNav) sidebarPositions.set(oldNav.closest(".sidebar").dataset.profileId, oldNav.scrollTop);
  socialUI?.beforeRender();
  closePopover();
  document.body.classList.toggle("sidebar-collapsed", sidebarIsCompact());
  document.body.dataset.arrivalMotion=state.dashboard?.pauseMotion?'paused':'running';
  document.body.dataset.theme = state.settings.theme;
  document.body.dataset.palette = state.settings.theme === 'light' ? 'classic' : state.settings.palette || 'aurora';
  document.body.dataset.view = ui.page === "space" ? state.settings.view : "adaptive";
  document.body.dataset.page = ui.page;
  app.innerHTML = `<div class="app-shell">${renderSidebar()}<main class="main">${ui.page === "space" ? `${renderTop()}${renderGreeting()}${renderToolbar()}<div id="sections">${renderSections()}</div><footer class="footer"><span>${icon("leaf")}A little less searching. A little more living.</span><span>Press <kbd>?</kbd> to find your shortcuts</span></footer>` : ui.page === "compare" ? compareUI.render() : socialUI.render()}</main>${socialUI.dock()}<div id="audio-host"></div></div>`;
  document.querySelector("#collection-nav").scrollTop = sidebarPositions.get(social.activeUser) || 0;
  syncSidebar();
  hydrate();
  renderAudioDock();
}
function renderContent() {

  document.querySelector("#sections").innerHTML = renderSections();
  hydrate();
}
function hydrate() {
  hydrateRails();
  socialUI?.hydrate();
  hydrateDocumentPreviews();
  document.querySelectorAll("[data-photo-id]").forEach(async (img) => {
    const blob = await getFile(img.dataset.photoId);
    if (!blob || !img.isConnected) return;
    const url = URL.createObjectURL(blob);
    img.onload = img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  });
  document.querySelectorAll("img.brand-logo").forEach((img) => {
    img.onerror = () => {
      img.hidden = true;
      img.nextElementSibling.hidden = false;
    };
  });
  state.cards
    .filter((c) => c.widget === "weather")
    .forEach((c) => {
      if (document.querySelector(`[data-widget="${CSS.escape(c.id)}"]`))
        refreshWeather(c);
    });
  refreshUsefulWidgets(state.cards);
  tickWidgets();
  updateYouTubeHighlight();
}
async function hydrateDocumentPreviews() {
  for (const art of document.querySelectorAll('body[data-page="space"] .card .document-art')) {
    if (art.querySelector('.document-mini')) continue;
    const card = state.cards.find(c => c.id === art.closest('[data-card]')?.dataset.card);
    if (!card?.fileId || !canViewCard(social, social.activeUser, card, social.activeUser)) continue;
    const kind = fileKind(card.fileName, card.mime);
    if (!['xlsx','pptx','docx','txt','md','json','log','csv'].includes(kind.ext)) continue;
    const cacheKey = `${card.fileId}:${card.fileName}:${card.updatedAt || ''}`;
    if (!documentPreviews.has(cacheKey)) documentPreviews.set(cacheKey, (async () => {
      const blob = await getFile(card.fileId);
      if (!blob) return '';
      if (['text','excel'].includes(kind.family) && !['xlsx'].includes(kind.ext)) return `<pre>${esc((await blob.text()).slice(0,600))}</pre>`;
      const markup = await officePreview(blob, card.fileName);
      const template = document.createElement('template');
      template.innerHTML = markup;
      const preview = template.content.querySelector('.sheet-table, .slide-preview, .word-preview');
      if (!preview) return '';
      preview.querySelectorAll('tr').forEach((row,index) => { if (index > 6) row.remove(); else [...row.children].slice(5).forEach(cell => cell.remove()); });
      return preview.outerHTML;
    })().catch(() => ''));
    const content = await documentPreviews.get(cacheKey);
    if (content && art.isConnected && !art.querySelector('.document-mini')) {
      const mini = document.createElement('div');
      mini.className = 'document-mini'; mini.setAttribute('aria-hidden','true'); mini.innerHTML = content;
      art.append(mini);
    }
  }
}
function tickWidgets() {
  for (const c of state.cards) {
    if (c.widget === "clock") {
      const n = document.querySelector(`[data-clock="${CSS.escape(c.id)}"]`);
      if (n) n.textContent = clockTime(c);
      const date = document.querySelector(
        `[data-clock-date="${CSS.escape(c.id)}"]`,
      );
      if (date) date.textContent = clockDate(c);
    }
    if (c.widget === "focus") {
      const t = timerState(c);
      const n = document.querySelector(`[data-timer="${CSS.escape(c.id)}"]`);
      if (n) n.textContent = timerText(c);
      const label = document.querySelector(
        `[data-timer-label="${CSS.escape(c.id)}"]`,
      );
      if (label) label.textContent = timerLabel(c);
      const b = document.querySelector(
        `[data-action="toggle-timer"][data-id="${CSS.escape(c.id)}"]`,
      );
      if (b) {
        b.innerHTML = icon(t.end ? "pause" : "play");
        b.setAttribute("aria-label", `${t.end ? "Pause" : "Start"} ${c.title}`);
      }
    }
  }
}
setUsefulWidgetNotifier(kind => {
  if(!state)return;
  for(const c of state.cards.filter(c=>c.widget===kind))document.querySelectorAll('[data-widget="'+CSS.escape(c.id)+'"]').forEach(node=>node.innerHTML=usefulWidgetBody(c,state));
});
setWidgetNotifier(() => {
  if (!state) return;
  for (const c of state.cards.filter((c) => c.widget === "weather")) {
    const n = document.querySelector(`[data-widget="${CSS.escape(c.id)}"]`);
    if (n) n.innerHTML = weatherBody(c);
  }
  tickWidgets();
});
setInterval(() => state && tickWidgets(), 1000);
function renderAudioDock() {
  const host = document.querySelector("#audio-host");
  const c = cardById(audioId());
  if (!c || !activeAudio) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `<section class="audio-dock" data-track-id="${esc(c.id)}" aria-label="Music player"><div class="mini-art">${icon("music")}</div><div class="dock-meta"><strong>${esc(c.title)}</strong><span id="audio-time"></span></div>${button("audio-stop", "Stop audio", "close")}<div class="audio-transport">${button("audio-previous", "Previous audio track", "previous")}${button("audio-toggle", "Play audio", "play")}${button("audio-next", "Next audio track", "next")}</div><input type="range" id="audio-seek" aria-label="Audio position" min="0" max="100" step="0.1" value="0"><select id="audio-repeat" aria-label="Audio repeat"><option value="all">Repeat collection</option><option value="one">Repeat track</option><option value="off">Repeat off</option></select><p id="audio-error" role="status" hidden></p></section>`;
  updateAudio();
}
function updateAudio() {
  rememberPlayback(audioId());
  if (activeAudio && document.querySelector(".audio-dock")?.dataset.trackId !== audioId()) renderAudioDock();
  document.querySelectorAll(".audio-card").forEach((el) => {
    const active = el.dataset.card === audioId();
    el.classList.toggle("playing", active && !activeAudio?.paused);
    const b = el.querySelector("[data-audio-icon]");
    if (b)
      b.innerHTML = icon(active && !activeAudio?.paused ? "pause" : "play");
    const p = el.querySelector("[data-audio-progress]");
    if (p)
      p.style.width = `${active && activeAudio?.duration ? (activeAudio.currentTime / activeAudio.duration) * 100 : 0}%`;
  });
  if (!activeAudio) return;
  const sec = Math.floor(activeAudio.currentTime || 0);
  const playback = audioPlayback();
  const duration = Number.isFinite(activeAudio.duration) ? Math.floor(activeAudio.duration) : 0;
  const time = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const n = document.querySelector("#audio-time");
  if (n)
    n.textContent = `${playback.index + 1} of ${playback.length} · ${time(sec)} / ${time(duration)} · ${playback.error ? "Unavailable" : playback.loading ? "Loading…" : activeAudio.ended ? "Finished" : activeAudio.paused ? "Paused" : "Now playing"}`;
  const seek = document.querySelector("#audio-seek");
  if (seek && document.activeElement !== seek)
    seek.value = activeAudio.duration
      ? (activeAudio.currentTime / activeAudio.duration) * 100
      : 0;
  const play = document.querySelector('[data-action="audio-toggle"]');
  if (play) {
    play.innerHTML = icon(activeAudio.paused ? "play" : "pause");
    play.setAttribute("aria-label", activeAudio.paused ? "Play audio" : "Pause audio");
    play.title = activeAudio.paused ? "Play audio" : "Pause audio";
  }
  for (const [action, direction] of [["audio-previous", -1], ["audio-next", 1]]) {
    const control = document.querySelector(`[data-action="${action}"]`);
    if (control) control.disabled = nextQueueIndex(playback.index, playback.length, playback.repeat, direction) < 0;
  }
  const repeat = document.querySelector("#audio-repeat");
  if (repeat) repeat.value = playback.repeat;
  const message = document.querySelector("#audio-error");
  if (message) { message.hidden = !playback.error; message.textContent = playback.error; }
}

function modal(title, subtitle, body, footer = "", wide = false) {
  closeSidebarDrawer();
  closePopover();
  dialog.classList.remove("social-detail", "wall-conversation", "document-preview");
  if (previewObjectURL) {
    URL.revokeObjectURL(previewObjectURL);
    previewObjectURL = null;
  }
  dialog.style.width = wide ? "min(860px, calc(100vw - 30px))" : "";
  dialog.innerHTML = `<div class="dialog-header"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>${button("close-dialog", "Close dialog", "close")}</div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-footer">${footer}</div>` : ""}`;
  if (!dialog.open) dialog.showModal();
}
function closeModal() {
  dialog.close();
}
dialog.addEventListener("close", () => {
  if (dialog.open) return;
  if (previewObjectURL) URL.revokeObjectURL(previewObjectURL);
  previewObjectURL = null;
  dialog.innerHTML = "";
  draft = null;
  clearTimeout(formTimer);
  clearTimeout(cityTimer);
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
const cancelButton =
  '<button type="button" class="secondary" data-action="close-dialog">Cancel</button>';
function colorPicker(selected) {
  return `<div class="color-options" role="group" aria-label="Card color">${COLORS.map((c) => `<button type="button" class="color-option tint-${c} ${selected === c ? "active" : ""}" data-action="choose-color" data-id="${c}" aria-label="${c} color" aria-pressed="${selected === c}">${selected === c ? icon("check") : ""}</button>`).join("")}</div>`;
}
function startCard(type = "link", id = null, collectionId = null, hint = '') {
  const existing = cardById(id);
  draft = existing
    ? structuredClone(existing)
    : {
        id: null,
        type,
        title: "",
        description: "",
        url: "",
        collectionId:
          collectionId ||
          (!["all", "favorites"].includes(ui.collection)
            ? ui.collection
            : state.collections[0]?.id) ||
          "__new",
        color: "sage",
        widget: "weather",
        city: "Brussels",
        latitude: 50.85,
        longitude: 4.35,
        timezone: "Europe/Brussels",
        minutes: 25,
        note: "",
        favorite: false,
      };
  if(existing?.launcher&&['app','steam'].includes(existing.launcher.kind))draft.type='app';
  draft.source = draft.launcher ? 'url' : draft.fileId ? 'upload' : !existing&&type==='file' ? computerUI.filePreference() : 'url';
  draft.localHint=hint;
  draft.selectedFile = null;
  draft.manualTitle = !!existing;
  draft.newCollection = "";
  showCardForm();
}
async function chooseLocalForForm(kind='file', name='') {
  const form=document.querySelector('#card-form');if(!form||form.dataset.linking)return;
  captureForm();const pending=draft,selectedOwner=social.activeUser;
  form.dataset.linking='true';form.setAttribute('aria-busy','true');
  const output=form.querySelector('#form-error');if(output)output.textContent='';
  try {
    const picked=await computerUI.chooseLocal(kind,name);
    if(!picked||draft!==pending||social.activeUser!==selectedOwner||!form.isConnected)return;
    Object.assign(draft,{...picked,source:'url',url:'',mime:'',selectedFile:null,localHint:'Linked original · stays on this PC and opens in its usual app.'});
    delete draft.fileId;delete draft.fileSize;
    if(!draft.manualTitle)draft.title=picked.fileName.replace(/\.[^.]+$/,'');
    computerUI.rememberFileChoice('url');showCardForm();
  } catch(error){if(output?.isConnected)output.textContent=error.message;else toast(error.message);}
  finally{if(form.isConnected){delete form.dataset.linking;form.removeAttribute('aria-busy');}}
}
async function acceptCardFile(file,source='upload') {
  if(!draft||!document.querySelector('#card-form')||!['file','audio','video'].includes(draft.type))return false;
  if(isExecutable(file)){toast('Choose App to add an application or shortcut.');return true;}
  if(source==='url'){await chooseLocalForForm('file',file.name);return true;}
  if(file.size>10*1024*1024){toast('This file is larger than 10 MB. Use Link instead.');return true;}
  captureForm();draft.selectedFile=file;draft.source='upload';delete draft.launcher;draft.localHint='';
  if(!draft.id)draft.type=localFileType(file);
  if(!draft.manualTitle)draft.title=file.name.replace(/\.[^.]+$/,'');
  computerUI.rememberFileChoice('upload');showCardForm();return true;
}
function captureForm() {
  const f = document.querySelector("#card-form");
  if (!f || !draft) return;
  for (const k of [
    "title",
    "description",
    "url",
    "collectionId",
    "newCollection",
    "tags", "progress", "artist", "genre", "year", "decade",
    "primarySubject", "secondarySubject", "contentKind", "creator", "album", "series",
    "timezone",
    "minutes",
    "note", "baseCurrency", "quoteCurrency", "amount", "newsSource", "targetDate",
  ])
    if (f.elements[k]) draft[k] = f.elements[k].value;
}
function showCardForm() {
  const d = draft;
  const app = d.type === 'app';
  const widgets = d.type === "widget";
  const sources = ["file", "audio", "video"].includes(d.type);
  const upload = sources && d.source === "upload";
  const linked=sources&&!upload&&validLauncher(d.launcher);
  let fields = "";
  if(app)fields=computerUI.appFields(d);
  if (widgets) {
    fields += `<div class="widget-picker">${WIDGETS.map((w) => `<button type="button" class="widget-choice tint-${widgetColors[w]} ${d.widget === w ? "active" : ""}" data-action="choose-widget" data-id="${w}"><span>${icon(EXTRA_WIDGETS[w]?.icon || (w === "focus" ? "timer" : w === "weather" ? "sun" : w))}</span><div><strong>${widgetNames[w]}</strong><small>${widgetDescriptions[w]}</small></div></button>`).join("")}</div>`;
  }
  if(widgets)fields += usefulWidgetFields(d);
  if (sources)
    fields += `<div class="source-tabs"><label><input type="radio" name="media-source" value="url" ${!upload ? "checked" : ""}>Link</label><label><input type="radio" name="media-source" value="upload" ${upload ? "checked" : ""}>Upload a file</label></div>`;
  if (upload) {
    fields += `<label class="file-drop">${icon("upload")}<strong>${d.selectedFile ? esc(d.selectedFile.name) : d.fileId && d.fileName ? esc(d.fileName) : "Drop a file here, or browse"}</strong><p>${d.selectedFile ? formatBytes(d.selectedFile.size) : d.fileId && d.fileName ? "Stored in this browser. Choose a file to replace it." : "Up to 10 MB · stays in this browser"}</p><input type="file" id="card-upload" aria-label="Choose ${d.type === "audio" ? "audio" : d.type === "video" ? "video" : "a"} file" ${d.type === "audio" ? 'accept="audio/*"' : d.type === "video" ? 'accept="video/*"' : ""}></label>`;
  }
  if(linked){
    fields+=`<div class="file-link-selected" data-file-link-drop>${icon(d.launcher.kind==='folder'?'folder':'file')}<div><strong>${esc(d.fileName||d.title)}</strong><small>Linked original · on this PC</small></div><button type="button" class="text-btn" data-action="choose-local-file" data-kind="${d.launcher.kind==='folder'?'folder':'file'}">Change</button><button type="button" class="icon-btn" data-action="clear-local-file" aria-label="Remove local file link">${icon('close')}</button></div>`;
  }
  if (!widgets && !app && !upload && !linked) {
    fields += `<label class="field">${d.type === "video" ? "Video link" : d.type === "audio" ? "Audio or Spotify link" : d.type === "file" ? "File link" : "Website URL"}<div class="url-field">${icon("link")}<input name="url" id="card-url" value="${esc(d.url)}" placeholder="${d.type === "video" ? "youtube.com/watch?v=…" : d.type === "audio" ? "A direct audio link or open.spotify.com/…" : "Paste a link, like figma.com"}" autocomplete="off" required></div><small>${d.type === "link" ? "We’ll find a name and website logo automatically." : d.type === "video" ? "YouTube, Vimeo, or a direct MP4 / WebM video." : d.type === "file" ? "Paste a web URL, or drop a file here to link its original." : "Direct audio files play here. Spotify opens an embedded player."}</small></label><div id="auto-preview-host"></div>`;
  }
  if(sources&&!upload){
    fields+=`<div class="file-link-actions"><span>Or ${d.launcher?'replace it with':'link an original from'} this PC</span><button type="button" class="text-btn" data-action="choose-local-file" data-kind="file">${icon('file')}Choose file</button>${d.type==='file'?`<button type="button" class="text-btn" data-action="choose-local-file" data-kind="folder">${icon('folder')}Folder</button>`:''}</div><p class="form-hint">${esc(d.localHint||'Originals stay on this PC and open in their usual app.')}</p>`;
  }
  if (widgets && d.widget === "weather")
    fields += `<label class="field">Location<div class="field-row"><input id="city-search" placeholder="Search for a city…" autocomplete="off" aria-label="Search weather city"><button type="button" class="secondary" data-action="find-city">${icon("search")}Find city</button></div><div class="city-results" id="city-results"></div></label><div class="city-selected">${icon("check")}<span>Selected: ${esc(d.city)}</span></div>`;
  if (widgets && d.widget === "clock")
    fields += `<label class="field">Time zone<select name="timezone">${["Europe/Brussels", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Asia/Jakarta", "Asia/Singapore", "Australia/Sydney", "UTC"].map((t) => `<option value="${t}" ${d.timezone === t ? "selected" : ""}>${t.replaceAll("_", " ").replace("/", " / ")}</option>`).join("")}</select></label>`;
  if (widgets && d.widget === "focus")
    fields += `<label class="field">Focus session (minutes)<input type="number" name="minutes" min="1" max="180" value="${d.minutes || 25}" required><small>A fresh session starts when you reopen the dashboard.</small></label>`;
  if (widgets && d.widget === "note")
    fields += `<label class="field">Your note<textarea name="note" maxlength="10000" placeholder="A thought worth keeping…">${esc(d.note)}</textarea></label>`;
  const html = `<form id="card-form"><div class="type-picker" role="group" aria-label="Card type">${TYPES.map((t) => `<button type="button" class="type-option ${d.type === t ? "active" : ""}" data-action="choose-type" data-id="${t}" aria-pressed="${d.type === t}">${icon(typeIcons[t])}${typeNames[t]}</button>`).join("")}<button type="button" class="type-option ${app ? "active" : ""}" data-action="choose-type" data-id="app" aria-pressed="${app}">${icon("monitor")}App</button></div>${fields}<div class="field-row"><label class="field">Name<input id="card-title" name="title" maxlength="160" value="${esc(d.title)}" placeholder="${widgets ? widgetNames[d.widget] : "Give it a name"}" required></label><label class="field">Collection<select name="collectionId">${collectionOptions(d.collectionId, true)}</select></label></div><label class="field" id="new-collection-field" ${d.collectionId === "__new" ? "" : "hidden"}>New collection name<input name="newCollection" maxlength="80" value="${esc(d.newCollection)}" placeholder="Something you love" ${d.collectionId === "__new" ? "required" : ""}></label>${!widgets ? `<label class="field">A little description <small>(optional)</small><input name="description" maxlength="500" value="${esc(d.description)}" placeholder="What makes this worth keeping?"></label>` : ""}${!widgets?organizationFields(d):""}<label class="field">A touch of color</label>${colorPicker(d.color)}<div id="form-error" class="form-error" role="alert"></div></form>`;
  modal(
    d.id ? "Make it yours." : "A new little possibility.",
    d.id
      ? "Fine-tune this card, just the way you like it."
      : "A link, a sound, a useful little widget. Give it a home.",
    html,
    `${cancelButton}<button type="submit" form="card-form" class="primary">${icon("plus")}${d.id ? "Save changes" : "Add to my space"}</button>`,
  );
  if (d.collectionId === "__new")
    document.querySelector("[name=collectionId]").value = "__new";
  if (!d.id && !d.title && widgets)
    document.querySelector("#card-title").value = widgetNames[d.widget];
  if (d.url && !upload) updateURLPreview(false);
  if(sources&&!upload&&!linked){const field=document.querySelector('#card-form .url-field');if(field)field.dataset.fileLinkDrop='';if(d.type==='file')document.querySelector('#card-url').placeholder='Paste a web link, or drop a file here';}
  if(app){computerUI.mountApps(d);document.querySelector('#computer-app-query')?.focus();}
  else if (!d.id) document.querySelector("#card-url, #card-title")?.focus();
}
function updateURLPreview(fill = true) {
  if (!draft) return;
  const input = document.querySelector("#card-url");
  if (!input) return;
  const url = safeURL(input.value);
  const host = document.querySelector("#auto-preview-host");
  if (!host) return;
  if (!url) {
    host.innerHTML = "";
    return;
  }
  const capture=captureSuggestion(social,social.activeUser,url);
  const m = {...metadata(url),...capture?.suggestion,host:domain(url)};
  host.innerHTML = `<div class="auto-preview"><img src="${esc(logoForURL(url))}" alt=""><div><strong>${esc(m.title || m.host)}</strong><p>${esc(m.host)} · automatic website logo</p></div>${icon("check")}</div>`;
  if(!draft.id&&capture){
    const existing=capture.existing;
    host.insertAdjacentHTML('beforeend',existing?`<div class="capture-assist"><span>${icon('check')}<strong>Already in your space</strong></span><p>Saved in ${esc(capture.collection?.name||'your collection')}. Saving here adds a reference, without creating another copy.</p><button type="button" class="text-btn" data-action="capture-open" data-id="${esc(existing.id)}">Open saved card ${icon('arrow')}</button></div>`:`<div class="capture-assist"><span>${icon('spark')}<strong>${capture.known?'Known in your community':'Link recognized'}</strong></span><p>${esc(typeNames[capture.suggestion.type])}${capture.collection?' · Suggested home: '+esc(capture.collection.name):''}${capture.suggestion.artist?' · '+esc(capture.suggestion.artist):capture.suggestion.creator?' · '+esc(capture.suggestion.creator):''}</p><button type="button" class="text-btn" data-action="capture-apply">Use suggested details ${icon('check')}</button><small>You can change every detail before saving.</small></div>`);
  }
  host.querySelector("img").onerror = (e) => {
    e.target.hidden = true;
  };
  if (fill && !draft.manualTitle) {
    const title = document.querySelector("#card-title");
    title.value = m.title;
    draft.title = m.title;
  }
  if (fill && !draft.id) {
    draft.color = m.color;
    document.querySelector(".color-options").outerHTML = colorPicker(
      draft.color,
    );
  }
}
async function saveCardForm(form) {
  captureForm();
  const d = draft;
  const title = d.title.trim();
  if (!title) throw Error("Give this card a name.");
  const data = {
    ...d,
    title,
    description: d.description.trim(),
    minutes: Number(d.minutes) || 25,
  };
  data.subjects=[...new Set([data.primarySubject,data.secondarySubject,...subjectIds(d).slice(2)].filter(Boolean))];delete data.primarySubject;delete data.secondarySubject;
  data.tags=cleanTags(data.tags); data.year=Number(data.year)||null;
  if(data.year) data.decade=`${Math.floor(data.year/10)*10}s`;
  if (!COLORS.includes(data.color)) data.color = "sage";
  const usingUpload =
    ["file", "audio", "video"].includes(d.type) && d.source === "upload";
  if(d.type==='app'&&(!validLauncher(d.launcher)||!['app','steam'].includes(d.launcher.kind)))throw Error('Choose an app from the list, or browse for one.');
  const usingLocal=['file','audio','video','app'].includes(d.type)&&d.source==='url'&&validLauncher(d.launcher);
  if(!usingLocal)delete data.launcher;
  if(usingLocal){data.url='';data.type='file';data.visibility='private';delete data.fileId;delete data.fileSize;}
  if (d.type !== "widget" && !usingUpload && !usingLocal) {
    data.url = isLocalAudioURL(d.url) ? d.url : safeURL(d.url);
    if (!data.url)
      throw Error("Use a valid website link starting with https://.");
    if (d.type === "video" && !videoSource(data.url))
      throw Error(
        "Use a specific YouTube or Vimeo video, a direct video URL, or upload a video. A channel homepage is a website card.",
      );
    if (
      d.type === "audio" &&
      !audioEmbed(data.url) &&
      !/\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|$)/i.test(data.url)
    )
      throw Error(
        "Use a direct audio file link, a Spotify track/album/playlist, or upload audio.",
      );
    delete data.fileId;
    delete data.fileName;
    delete data.mime;
    delete data.fileSize;
  }
  if (usingUpload) {
    if (!d.selectedFile && !d.fileId) throw Error("Choose a file to add.");
    if (d.selectedFile) {
      if(isExecutable(d.selectedFile))throw Error('Choose App to add an application.');
      if (d.selectedFile.size > 10 * 1024 * 1024)
        throw Error("Choose a file smaller than 10 MB.");
      if (d.type === "audio" && localFileType(d.selectedFile)!=='audio')
        throw Error("Choose an audio file.");
      if (d.type === "video" && localFileType(d.selectedFile)!=='video')
        throw Error("Choose a video file.");
      const fileId = uid();
      await putFile(fileId, d.selectedFile);
      Object.assign(data, {
        fileId,
        fileName: d.selectedFile.name,
        mime: d.selectedFile.type,
        fileSize: d.selectedFile.size,
      });
    }
    data.url = "";
  }
  if (d.type === "widget") {
    data.url = "";
    delete data.fileId;
    delete data.fileName;
  }
  if (data.collectionId === "__new") {
    const name = d.newCollection.trim();
    if (!name) throw Error("Give the new collection a name.");
    if (
      state.collections.some((c) => c.name.toLowerCase() === name.toLowerCase())
    )
      throw Error(
        "A collection with that name already exists. Choose it in the list.",
      );
    data.collectionId = uid();
    state.collections.push({
      id: data.collectionId,
      name,
      description: "",
      color: data.color,
      icon: "collection",
      collapsed: false,
    });
  }
  if (!collectionById(data.collectionId))
    throw Error("Choose a collection for this card.");
  for (const k of ["selectedFile", "source", "manualTitle", "newCollection", "localHint", "appLabel", "appCatalogId"])
    delete data[k];
  if(!d.id&&!usingUpload&&!usingLocal&&data.type!=='widget'){
    const existing=state.cards.find(c=>c.type!=='widget'&&!c.fileId&&resourceKey(c,social.activeUser)===resourceKey(data,social.activeUser));
    if(existing){
      if(!inCollection(existing,data.collectionId))existing.collectionIds=[...(existing.collectionIds||[]),data.collectionId];
      await persist();closeModal();ui.collection=data.collectionId;ui.page='space';ui.query='';ui.filter='all';render();
      toast('Already saved. This collection now points to your existing card.');return;
    }
  }
  const editing = !!d.id;
  const previousSource = editing ? cardById(d.id) : null;
  if (previousSource && (data.url !== previousSource.url || data.fileId !== previousSource.fileId)) {
    delete data.sourceRef; delete data.resourceKey; delete data.savedFrom;
    if (data.fileId) data.visibility = "private";
  }
  data.id = d.id || uid();
  data.createdAt = d.createdAt || Date.now();
  if (editing) {
    state.cards[state.cards.findIndex((c) => c.id === data.id)] = data;
    resetTimer(data);
    if (audioId() === data.id) stopAudio();
  } else state.cards.push(data);
  collectionById(data.collectionId).collapsed = false;
  overviewFolded.delete(data.collectionId);
  state.settings.foldedCollections = [...overviewFolded];
  await persist();
  closeModal();
  ui.filter = "all";
  ui.query = "";
  ui.collection = data.collectionId;
  ui.page = "space";
  render();
  toast(
    editing ? "A little update, saved." : "Your new card is right at home.",
  );
}
function collectionForm(id = null) {
  const c = collectionById(id) || {
    id: "",
    name: "",
    description: "",
    color: "sage",
  };
  modal(
    c.id ? "A little collection care." : "Make room for a new collection.",
    c.id
      ? "A name, a purpose, a color. Make it yours."
      : "Bring related things together, however you like.",
    `${!c.id ? `<button class="live-collection-invite" data-action="new-smart">${icon("spark")}<span><strong>Create a smart collection</strong><small>You choose the rules. New finds appear automatically.</small></span>${icon("arrow")}</button><button class="live-collection-invite" data-social="live-browse">${icon("compass")}<span><strong>Or follow a living collection</strong><small>Curated by people. Updated as they add new finds.</small></span>${icon("arrow")}</button>` : ""}<form id="collection-form" data-id="${esc(c.id)}"><label class="field">Collection name<input name="name" value="${esc(c.name)}" maxlength="80" placeholder="Weekend projects, favorite places…" required autofocus></label><label class="field">A little description <small>(optional)</small><input name="description" value="${esc(c.description)}" maxlength="200" placeholder="What belongs here?"></label><label class="field">Folder<select name="folderId" id="collection-folder">${folderOptions(c.folderId)}</select></label><label class="field" id="new-folder-field" hidden>New folder name<input name="newFolder" maxlength="60" placeholder="Music, Work, Life…"></label><label class="field">Color</label><div id="collection-colors" data-color="${c.color}">${colorPicker(c.color)}</div><div id="form-error" class="form-error" role="alert"></div></form>`,
    `${cancelButton}<button class="primary" type="submit" form="collection-form">${c.id ? "Save changes" : "Create collection"}</button>`,
  );
}
async function saveCollection(form) {
  ui.page = "space";
  const name = form.elements.name.value.trim();
  if (!name) throw Error("Give your collection a name.");
  const id = form.dataset.id;
  if (
    state.collections.some(
      (c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase(),
    )
  )
    throw Error("You already have a collection with this name.");
  const data = {
    name,
    description: form.elements.description.value.trim(),
    color: document.querySelector("#collection-colors").dataset.color,
    folderId: form.elements.folderId.value,
  };
  if(data.folderId==="__new") { const folderName=form.elements.newFolder.value.trim();if(!folderName)throw Error("Give your folder a name.");state.folders ||= [];const existing=state.folders.find(f=>f.name.toLowerCase()===folderName.toLowerCase());data.folderId=existing?.id||uid();if(!existing)state.folders.push({id:data.folderId,name:folderName,collapsed:false}); }
  const c = collectionById(id);
  if(data.folderId&&c?.folderId!==data.folderId)state.settings.groupCollections=true;
  if (c) Object.assign(c, data);
  else
    state.collections.push({
      ...data,
      id: uid(),
      icon: "collection",
      collapsed: false,
    });
  await persist();
  closeModal();
  render();
  toast(c ? "Collection updated." : "A fresh collection, ready for you.");
}
function cardMenu(id, trigger) {
  const c = cardById(id);
  if (!c) return;
  openPopover(
    trigger, c.title,
    `<div class="card-size-picker"><span>Card size</span><div role="group" aria-label="Card size">${Object.entries(SIZES).map(([value,label]) => `<button data-action="card-size" data-id="${esc(id)}" data-size="${value}" aria-pressed="${(c.size || "auto") === value}">${label}</button>`).join("")}</div><small>Applies in Mixed grid. Automatic adapts to the content.</small></div><div class="menu-list"><button data-social="detail" data-owner="${esc(social.activeUser)}" data-card-id="${esc(id)}">${icon("expand")}Open full card</button>${!c.launcher?`<button data-social="share" data-kind="card" data-id="${esc(id)}">${icon("share")}Sharing settings</button>`:""}${c.coverFileId?`<button data-action="computer-remove-cover" data-id="${esc(id)}">${icon("image")}Remove custom cover</button>`:""}${c.type!=="widget"?`<button data-action="compare-add" data-id="${esc(id)}">${icon("compare")}Compare cards</button>`:""}<button data-action="edit-card" data-id="${esc(id)}">${icon("edit")}Edit card</button><button data-action="organize-card" data-id="${esc(id)}">${icon("collection")}Collections, tags & progress</button><button data-action="move-card" data-id="${esc(id)}">${icon("move")}Change home collection</button><button data-action="favorite-menu" data-id="${esc(id)}">${icon("star")}${c.favorite ? "Remove from favorites" : "Add to favorites"}</button><hr class="menu-divider"><button class="danger" data-action="delete-card" data-id="${esc(id)}">${icon("trash")}Remove card</button></div>`,
  );
}
function moveCardDialog(id) {
  const c = cardById(id);
  modal(
    "A new home.",
    `Move “${c.title}” to another collection.`,
    `<form id="move-form" data-id="${esc(id)}"><label class="field">Collection<select name="collection">${collectionOptions(c.collectionId)}</select></label><p class="form-hint">You can also drag cards between collections on your dashboard.</p><div id="form-error" class="form-error" role="alert"></div></form>`,
    `${cancelButton}<button class="primary" type="submit" form="move-form">Move card</button>`,
  );
}
function collectionMenu(id, trigger) {
  const c = collectionById(id);
  if (!c) return;
  const position = state.collections.findIndex(collection => collection.id === id);
  openPopover(
    trigger, c.name,
    `<div class="menu-list"><button data-social="share" data-kind="collection" data-id="${esc(id)}">${icon("share")}Sharing settings</button><button data-social="collection" data-owner="${esc(social.activeUser)}" data-id="${esc(id)}">${icon("users")}Collect together & conversation</button><button data-action="smart-settings" data-id="${esc(id)}">${icon("spark")}${c.smart?.enabled?"Update rules":"Automatic updates…"}</button>${!c.smart?.enabled?`<button data-action="recommendations-restore" data-id="${esc(id)}">${icon("spark")}Show suggestions</button>`:""}<button data-action="collection-widget-tools" data-id="${esc(id)}">${icon("widget")}Add a useful widget</button><button data-action="edit-collection" data-id="${esc(id)}">${icon("edit")}Edit collection</button><button data-action="collection-earlier" data-id="${esc(id)}" ${position === 0 ? "disabled" : ""}>${icon("chevron")}Move collection up</button><button data-action="collection-later" data-id="${esc(id)}" ${position === state.collections.length - 1 ? "disabled" : ""}>${icon("chevron")}Move collection down</button><button data-action="collapse-menu" data-id="${esc(id)}">${icon("down")}${overviewFolded.has(c.id) ? "Expand" : "Collapse"} on dashboard</button><hr class="menu-divider"><button class="danger" data-action="delete-collection" data-id="${esc(id)}">${icon("trash")}Remove collection</button></div>`,
  );
}
function deleteCollectionDialog(id) {
  const c = collectionById(id);
  const count = state.cards.filter((x) => x.collectionId === id).length;
  const others = personalCollections(state).filter((x) => x.id !== id);
  modal(
    "Remove this collection?",
    `${c.name} has ${count} ${count === 1 ? "card" : "cards"}. You choose what happens to them.`,
    `<form id="delete-collection-form" data-id="${esc(id)}">${count ? `<label class="field">What should happen to the cards?<select name="target">${others.map((x) => `<option value="${esc(x.id)}">Keep cards in ${esc(x.name)}</option>`).join("")}<option value="__delete">Remove these cards too</option></select></label>` : '<p class="form-hint">This empty collection will be removed.</p>'}<div id="form-error" class="form-error" role="alert"></div></form>`,
    `${cancelButton}<button type="submit" form="delete-collection-form" class="secondary danger-button">Remove collection</button>`,
  );
}
function appearanceMenu(trigger) {
  const selected = appearanceId(state.settings);
  openPopover(trigger, 'Make it yours', `<p class="appearance-intro">Choose the mood of your space.</p><div class="appearance-choices" role="group" aria-label="Color theme">${APPEARANCES.map(item => `<button type="button" class="appearance-choice" data-action="set-appearance" data-id="${item.id}" aria-pressed="${selected === item.id}"><span class="appearance-swatch" data-appearance="${item.id}" aria-hidden="true"><i></i><span><b></b><b></b><b></b></span></span><span class="appearance-copy"><strong>${item.name}</strong><small>${item.description}</small></span><span class="appearance-check">${selected === item.id ? icon('check') : ''}</span></button>`).join('')}</div><p class="appearance-hint">Saved for this profile. Press <kbd>T</kbd> to cycle dark themes.</p>`, 'appearance-popover');
}
function settingsDialog() {
  const p = state.settings;
  modal(
    "A space that feels like you.",
    "Small details. A big difference.",
    `<form id="settings-form"><label class="field">What should we call you?<input name="name" value="${esc(p.name)}" maxlength="40" required></label><label class="field">Your dashboard headline<input name="title" value="${esc(p.title)}" maxlength="90" required></label><label class="field">A line underneath<input name="subtitle" value="${esc(p.subtitle)}" maxlength="150"></label><div class="field-row"><label class="field">Appearance<select name="appearance">${APPEARANCES.map(item => `<option value="${item.id}" ${appearanceId(p) === item.id ? "selected" : ""}>${item.name}</option>`).join("")}</select></label><label class="field">Default view<select name="view">${Object.entries(VIEWS).map(([v,label]) => `<option value="${v}" ${p.view === v ? "selected" : ""}>${label}</option>`).join("")}</select></label></div><label class="field">Sidebar<select name="sidebarMode"><option value="auto" ${sidebarMode() === "auto" ? "selected" : ""}>Automatic · compact in smaller windows</option><option value="expanded" ${sidebarMode() === "expanded" ? "selected" : ""}>Expanded · keep labels visible</option><option value="compact" ${sidebarMode() === "compact" ? "selected" : ""}>Compact · icons only</option></select></label><div id="form-error" class="form-error" role="alert"></div></form><section class="settings-section"><h3>New-card highlights</h3><p>New for you lives in the Community feed. New cards stay highlighted inside their collections.</p><button class="secondary" data-action="arrival-motion">${state.dashboard?.pauseMotion?"Resume":"Pause"} new-card animation</button></section><section class="settings-section"><h3>A fresh start.</h3><p>Try a blank canvas or reload the example collections.</p><div class="settings-buttons"><button class="secondary" data-action="reset-confirm" data-id="blank">Start empty</button><button class="secondary" data-action="reset-confirm" data-id="demo">Restore starter cards</button></div></section><p class="settings-footer">No account. No cloud sync. Weather uses Open-Meteo; website logos use Google’s favicon service. Only the chosen city coordinates and website domains are requested. Uploaded files stay in this browser. The ambient sample “Slow orbit” was created for this prototype.</p>`,
    `${cancelButton}<button class="primary" type="submit" form="settings-form">Save preferences</button>`,
  );
}
function shortcutsDialog() {
  modal(
    "Make yourself at home.",
    "A few small shortcuts for moving around your space.",
    `<div>${[
      ["Find a card", "/"],
      ["Add a new card", "N"],
      ["Switch dashboard view", "V"],
      ["Cycle dark themes", "T"],
      ["This little guide", "?"],
      ["Close a dialog", "Esc"],
    ]
      .map(
        ([a, b]) =>
          `<div class="shortcut-row"><span>${a}</span><kbd>${b}</kbd></div>`,
      )
      .join(
        "",
      )}</div><section class="settings-section"><h3>Simple ways to organize.</h3><p><strong>Collections</strong> hold your cards. Optional <strong>folders</strong> group collections in your sidebar. <strong>Topics, genre and year</strong> describe the content for search. <strong>Tags</strong> are your own private labels. A <strong>smart collection</strong> finds new cards using the rules you choose.</p><h3>Everything has a place.</h3><p>Use the card’s menu to edit, move, favorite, or remove it. Drag a card from its picture, title, or background to arrange it, or drop it onto a collection in the sidebar. Click a collection title to fold it away. The menu also lets you choose a different home collection.</p><p>Notes save as you type. A focus timer continues while you browse this dashboard; reloading starts a fresh session. Website cards open their original site in a new tab.</p></section>`,
  );
}
function updateYouTubeHighlight() {
  document
    .querySelectorAll("[data-card]")
    .forEach((el) =>
      el.classList.toggle(
        "youtube-playing",
        el.dataset.card === playingYouTubeId(),
      ),
    );
}
let lastSeenPlayback='';
function rememberPlayback(id){
  if(!id||id===lastSeenPlayback)return;
  lastSeenPlayback=id;
  const card=sharedPlayback?.cards.find(c=>c.id===id);
  if(card?.sourceRef)rememberOpened(card.sourceRef.owner,social.spaces[card.sourceRef.owner]?.cards.find(c=>c.id===card.sourceRef.id)).catch(e=>toast(e.message));
}
onYouTubeChange(()=>{updateYouTubeHighlight();rememberPlayback(playingYouTubeId());});
async function playMusicCollection(collectionId, cardId = null) {
  const queue = audioCollectionQueue(collectionPlaybackCards(collectionId), collectionId);
  if (!queue.length) return;
  const card = queue.find((c) => c.id === cardId) || queue[0];
  stopYouTube();
  await playAudio(card, updateAudio, queue, toast);
}
async function playCollection(collectionId, cardId = null) {
  const queue = collectionQueue(collectionPlaybackCards(collectionId), collectionId);
  if (!queue.length) return;
  stopAudio();
  renderAudioDock();
  updateAudio();
  await openYouTubeQueue(
    queue,
    collectionById(collectionId)?.name || "Your collection",
    Math.max(
      0,
      queue.findIndex((c) => c.id === cardId),
    ),
  );
}
async function openCard(c, contextCollection = c.collectionId) {
  stopFlowMedia();
  // Saving recent history replaces state objects. Resolve ownership first.
  const owner = state.cards.includes(c) ? social.activeUser : sharedPlayback?.owner;
  if (!canViewCard(social, owner, c, social.activeUser)) throw Error("This card is no longer shared with you.");
  if(owner===social.activeUser)await rememberOpened(owner,c);
  if(c.launcher){await computerUI.open(c);return;}
  if (c.type === "link") {
    window.open(c.url, "_blank", "noopener,noreferrer");
    return;
  }
  if (c.type === "video" && videoSource(c.url)?.provider === "youtube") {
    await playCollection(contextCollection, c.id);
    return;
  }
  if (c.type !== "file" && c.type !== "link") pauseYouTube();
  if (c.type === "audio" && !audioEmbed(c.url)) {
    await playMusicCollection(contextCollection, c.id);
    return;
  }
  if (c.type !== "file") activeAudio?.pause();
  updateAudio();
  if (c.fileId) {
    await previewFile(c);
    return;
  }
  if (c.type === "file") {
    if (fileKind(c.fileName || c.url, c.mime).label === "Photo") {
      previewPhoto(c);
      return;
    }
    window.open(c.url, "_blank", "noopener,noreferrer");
    return;
  }
  if (c.type === "audio") {
    modal(
      c.title,
      c.description,
      `<div class="player-content" style="aspect-ratio:auto;min-height:352px"><iframe style="height:352px" src="${esc(audioEmbed(c.url))}" title="Spotify player" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe></div>`,
      "",
      true,
    );
    return;
  }
  modal(
    c.title,
    c.description,
    `<div class="player-content">${videoMarkup(c.url)}</div><div class="file-info">${icon("video")}Playback depends on the source’s availability and embed settings.</div>`,
    `<a class="secondary" href="${esc(c.url)}" target="_blank" rel="noopener">Open original ${icon("arrow")}</a>`,
    true,
  );
}
async function previewFile(c) {
  const blob = await getFile(c.fileId);
  if (!blob)
    throw Error(
      "The saved file is missing. Edit this card to attach it again.",
    );
  let body = "";
  let text = "";
  const image = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/avif",
  ].includes(blob.type);
  const pdf = blob.type === "application/pdf";
  const video = blob.type.startsWith("video/");
  const kind = fileKind(c.fileName, blob.type);
  if (["xlsx", "xlsm", "pptx", "pptm", "docx", "docm"].includes(kind.ext)) {
    try {
      body = await officePreview(blob, c.fileName);
    } catch {
      body = `<div class="file-preview-placeholder">${icon(kind.icon)}<p>We couldn’t preview this document. It may be encrypted, too large, or use unsupported formatting. Download it to open in its usual app.</p></div>`;
    }
  } else if (
    blob.type.startsWith("text/") ||
    /\.(txt|md|csv|json)$/i.test(c.fileName)
  ) {
    text = (await blob.text()).slice(0, 100000);
    body = `<pre class="file-text">${esc(text)}</pre>`;
  } else if (image)
    body =
      '<div class="player-content" style="aspect-ratio:auto"><img id="file-image" alt="Uploaded image preview"></div>';
  else if (pdf)
    body =
      '<div class="player-content" style="aspect-ratio:auto;height:60vh"><iframe id="file-pdf" title="PDF preview"></iframe></div>';
  else if (video)
    body =
      '<div class="player-content"><video id="file-video" controls autoplay playsinline></video></div>';
  else if (blob.type.startsWith("audio/")) {
    stopYouTube();
    await playAudio(c, updateAudio, [c], toast);
    renderAudioDock();
    return;
  } else
    body = `<div class="file-preview-placeholder">${icon(kind.icon)}<p>${esc(kind.label)} · ${esc(kind.ext.toUpperCase())}<br>This format is ready to download. For an in-page Office preview, use XLSX, PPTX or DOCX.</p></div>`;
  modal(
    c.title,
    c.description,
    `${body}<div class="file-info">${icon("file")}${esc(c.fileName)} · ${formatBytes(blob.size)} · saved in this browser</div>`,
    `<button class="primary" data-action="download-file" data-id="${esc(c.id)}">${icon("download")}Download file</button>`,
    true,
  );
  if (!image && !video) dialog.classList.add("document-preview");
  previewObjectURL = URL.createObjectURL(blob);
  const player = dialog.querySelector("#file-image, #file-pdf, #file-video");
  if (player) player.src = previewObjectURL;
}
function previewPhoto(c) {
  const photos = state.cards.filter(
    (x) =>
      x.collectionId === c.collectionId &&
      x.type === "file" &&
      fileKind(x.fileName || x.url, x.mime).label === "Photo",
  );
  const at = photos.findIndex((x) => x.id === c.id);
  modal(
    c.title,
    c.description,
    `<div class="photo-viewer"><img src="${esc(c.url)}" alt="${esc(c.title)}"></div>`,
    `<span>${at + 1} of ${photos.length}</span><button class="secondary" data-action="open-card" data-id="${esc(photos[(at - 1 + photos.length) % photos.length].id)}">${icon("previous")}Previous photo</button><button class="secondary" data-action="open-card" data-id="${esc(photos[(at + 1) % photos.length].id)}">Next photo${icon("next")}</button>${safeURL(c.sourceURL) ? `<a class="secondary" href="${esc(c.sourceURL)}" target="_blank" rel="noopener">Photo credit ${icon("arrow")}</a>` : ""}`,
    true,
  );
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function resetConfirm(mode) {
  modal(
    mode === "blank" ? "A clean canvas?" : "Welcome back to the beginning.",
    mode === "blank"
      ? "Start with one empty collection and make it completely yours."
      : "Restore the original example cards, widgets, and collections.",
    `<p class="form-hint">This replaces this profile’s dashboard cards and collections. The other demo profile stays as it is.</p>`,
    `${cancelButton}<button class="secondary danger-button" data-action="reset" data-id="${mode}">${mode === "blank" ? "Start empty" : "Restore starter"}</button>`,
  );
}
async function resetDashboard(mode) {
  const next = seedState();
  const files = new Map();
  if (mode === "blank") {
    next.cards = [];
    next.collections = [
      {
        id: uid(),
        name: "My first collection",
        description: "A space for what matters to you.",
        color: "sage",
        icon: "collection",
        collapsed: false,
      },
    ];
    next.settings = state.settings;
  } else
    files.set("welcome-file", new Blob([welcomeText], { type: "text/plain" }));
  for (const [id, blob] of files) await putFile(id, blob);
  next.settings.name = state.settings.name;
  state = next;
  await persist();
  stopYouTube();
  clearTimers();
  stopAudio();
  ui.collection = "all";
  ui.page = "space";
  ui.query = "";
  ui.filter = "all";
  closeModal();
  render();
  toast(
    mode === "blank"
      ? "A fresh start. Make it yours."
      : "Your starter dashboard is back.",
  );
}
async function citySearch() {
  const input = document.querySelector("#city-search");
  if (!input || !draft) return;
  const q = input.value.trim();
  const results = document.querySelector("#city-results");
  if (q.length < 2) {
    results.textContent = "Type at least two letters.";
    return;
  }
  const activeDraft = draft;
  results.textContent = "Finding your city…";
  try {
    const found = await findCities(q);
    if (draft !== activeDraft || !results.isConnected) return;
    cityResults = found;
    results.innerHTML = found.length
      ? found
          .map(
            (c, i) =>
              `<button type="button" data-action="choose-city" data-id="${i}">${esc(c.name)}<span>${esc([c.admin1, c.country].filter(Boolean).join(", "))}</span></button>`,
          )
          .join("")
      : "No city found. Try a nearby town.";
  } catch (e) {
    if (results.isConnected) results.textContent = e.message;
  }
}
async function handleAction(action, el) {
  if(await computerUI?.click(action,el))return;
  if(await collectionExperienceUI?.click(action,el))return;
  if(await highlightsUI?.click(action,el))return;
  if(action==='refresh-useful-widget'){await loadUsefulData(cardById(el.dataset.id),true);return;}
  if(action==='rediscover-next'){const c=cardById(el.dataset.id);c.rediscoverOffset=(c.rediscoverOffset||0)+2;await persist();render();return;}
  if(action==='save-headline'){
    const article=headlineFor(cardById(el.dataset.id),Number(el.dataset.index));if(!article)return;
    const existing=state.cards.find(c=>c.url===article.url);
    if(existing){toast('Already in your space.');return;}
    const owner=social.activeUser,newsCard=cardById(el.dataset.id),saved={id:uid(),type:'link',title:article.title,url:article.url,description:'From BBC News',collectionId:newsCard.collectionId,color:'blue',progress:'later',visibility:'private',favorite:false,contentKind:'article',subjects:collectionById(newsCard.collectionId)?.subjects||[],createdAt:Date.now()};
    state.cards.push(saved);await persist();render();toast('Saved for later in '+collectionById(saved.collectionId).name+'.',async()=>{social.spaces[owner].cards=social.spaces[owner].cards.filter(c=>c.id!==saved.id);if(social.activeUser===owner)state=social.spaces[owner];await persist();render();});return;
  }
  if(action==='collection-widget-tools'){
    const c=collectionById(el.dataset.id),text=(c.name+' '+(c.subjects||[]).join(' ')).toLowerCase();
    const kinds=/money|finance|market/.test(text)?['currency','crypto','news']:/travel|holiday|place/.test(text)?['weather','currency','countdown']:/work|learn|project|study/.test(text)?['tasks','note','focus','continue']:/news/.test(text)?['news','continue']:['note','tasks','continue','rediscover'];
    openPopover(el,'Useful in '+c.name,'<div class="menu-list">'+kinds.map(kind=>'<button data-action="collection-add-widget" data-id="'+esc(c.id)+'" data-widget="'+kind+'">'+icon(EXTRA_WIDGETS[kind]?.icon||({tasks:'check',continue:'bookmark',weather:'sun',focus:'timer'})[kind]||kind)+widgetNames[kind]+'</button>').join('')+'</div>');return;
  }
  if(action==='collection-add-widget'){startCard('widget',null,el.dataset.id);draft.widget=el.dataset.widget;draft.title=widgetNames[draft.widget];draft.color=widgetColors[draft.widget];showCardForm();return;}
  if(await compareUI?.click(action,el))return;
  if(await spaceTools?.click(action,el))return;
  if (action === "scroll-rail") { scrollRail(el); return; }
  const id = el.dataset.id;
  switch (action) {
    case "capture-open": { closeModal();await openCard(cardById(id));break; }
    case "capture-apply": {
      captureForm();const result=captureSuggestion(social,social.activeUser,draft.url);if(!result)break;
      const title=draft.title,manual=draft.manualTitle;Object.assign(draft,result.suggestion);
      if(manual)draft.title=title;draft.primarySubject=draft.subjects?.[0]||"";draft.secondarySubject=draft.subjects?.[1]||"";
      if(result.collection)draft.collectionId=result.collection.id;draft.source="url";showCardForm();break;
    }
    case "show-new-arrival": {
      ui.page='space';ui.collection=id;ui.query='';ui.filter='all';render();window.scrollTo({top:0,behavior:'smooth'});break;
    }
    case "smart-mark-seen": {
      for(const e of collectionEntries(social,social.activeUser,collectionById(id)).filter(e=>e.isNew))markResourceSeen(social,social.activeUser,e.owner,e.card);
      markDiscoveriesSeen(social,social.activeUser,id,collectionEntries(social,social.activeUser,collectionById(id)).filter(e=>e.isNew).map(e=>e.key));await persist();render();toast('New discoveries marked seen.');break;
    }
    case "live-card-menu": {
      const entry=collectionEntries(social,social.activeUser,collectionById(id)).find(e=>e.key===el.dataset.key);if(!entry)break;
      openPopover(el,entry.card.title,`<div class="menu-list"><button data-social="detail" data-owner="${esc(entry.owner)}" data-card-id="${esc(entry.card.id)}">${icon("expand")}Open full card</button>${entry.isNew?'<button data-action="live-card-seen" data-id="'+esc(id)+'" data-key="'+esc(entry.key)+'">'+icon('check')+'Mark seen</button>':''}<button data-social="save" data-owner="${esc(entry.owner)}" data-card-id="${esc(entry.card.id)}">${icon('collection')}Add to another collection</button><button data-action="smart-hide" data-id="${esc(id)}" data-key="${esc(entry.key)}">${icon('close')}Hide from this collection</button></div>`);break;
    }
    case "live-card-seen": {
      const entry=collectionEntries(social,social.activeUser,collectionById(id)).find(e=>e.key===el.dataset.key);if(entry)await rememberOpened(entry.owner,entry.card);break;
    }
    case "smart-open": {
      const e=collectionEntries(social,social.activeUser,collectionById(id)).find(e=>e.key===el.dataset.key);if(!e)throw Error('This discovery is no longer available.');
      if(e.card.type==='video'&&videoSource(e.card.url)?.provider==='youtube')await playCollection(id,'smart:'+e.owner+':'+e.card.id);
      else if(e.card.type==='audio'&&!audioEmbed(e.card.url))await playMusicCollection(id,'smart:'+e.owner+':'+e.card.id);
      else await openShared(e.owner,e.card);
      if(e.isNew){markDiscoveriesSeen(social,social.activeUser,id,[e.key]);await persist();render();}break;
    }
    case "remove-task": { const c=cardById(id);c.tasks=(c.tasks||[]).filter(task=>task.id!==el.dataset.taskId);await persist();render();break; }
    case "organize-card": organizeCard(id); break;
    case "folder-fold": { const folder=state.folders.find(f=>f.id===id);folder.collapsed=!folder.collapsed;await persist();render();break; }
    case "folder-menu": { const folder=state.folders.find(f=>f.id===id);openPopover(el,folder.name,`<div class="menu-list"><button data-action="folder-rename" data-id="${esc(id)}">${icon('edit')}Rename folder</button><button data-action="folder-remove" data-id="${esc(id)}">${icon('trash')}Remove folder · keep collections</button></div>`);break; }
    case "folder-rename": { const folder=state.folders.find(f=>f.id===id);modal('Rename folder','Keep your collections easy to find.',`<form id="folder-form" data-id="${esc(id)}"><label class="field">Folder name<input name="name" required maxlength="60" value="${esc(folder.name)}"></label><div id="form-error" role="alert"></div></form>`,cancelButton+'<button class="primary" form="folder-form" type="submit">Save name</button>');break; }
    case "folder-remove": state.folders=state.folders.filter(f=>f.id!==id);state.collections.forEach(c=>{if(c.folderId===id)delete c.folderId;});await persist();render();toast('Folder removed. Your collections are still here.');break;
    case "collapse-sidebar":
      if (sidebarDrawer.matches) { closeSidebarDrawer(true); break; }
      state.settings.sidebarMode = sidebarIsCompact() ? "expanded" : "compact";
      state.settings.sidebarCollapsed = state.settings.sidebarMode === "compact";
      syncSidebar(); await persist(); break;
    case "space-menu":
      openPopover(el, "Your space", `<div class="menu-list"><button data-action="connections">${icon("link")}Import & connections</button><button data-action="computer-show">${icon("monitor")}App</button><button data-action="organize-collections">${icon("collection")}Organize collections</button><button data-action="compare-open">${icon("compare")}Compare cards</button><button data-action="settings">${icon("settings")}Personalize</button><button data-action="shortcuts">${icon("help")}A little help</button></div><div class="demo-space-tool"><button data-action="create-demo-space">${icon("spark")}<span><strong>Create a demo space</strong><small>A full starter dashboard · no sign-up</small></span>${icon("plus")}</button></div><p class="form-hint">Built around you. · v0.19.1</p>`, "space-tools-popover"); break;
    case "home":
    case "navigate":
      ui.page = "space";
      ui.collection = action === "home" ? "all" : id;
      ui.mobile = false;
      ui.query = "";
      ui.filter = "all";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      break;
    case "toggle-sidebar":
      ui.mobile = !ui.mobile; syncSidebar();
      if (ui.mobile) document.querySelector(".sidebar-collapse")?.focus();
      break;
    case "close-sidebar":
      closeSidebarDrawer(true);
      break;
    case "filter":
      ui.filter = id;
      render();
      document.querySelector(`.filter[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      break;
    case "clear-search":
      clearSearch();
      break;
    case "clear-filters":
      ui.query = "";
      ui.filter = "all";
      render();
      break;
    case "theme":
      appearanceMenu(el);
      break;
    case "set-appearance":
      if (!APPEARANCES.some(item => item.id === id)) return;
      Object.assign(state.settings, appearanceSettings(id));
      await persist();
      render();
      toast(`${APPEARANCES.find(item => item.id === id).name} theme applied.`);
      break;
    case "card-size":
      if (!(el.dataset.size in SIZES)) return;
      cardById(id).size = el.dataset.size;
      await persist(); closeModal(); render();
      break;
    case "view":
      state.settings.view = id;
      await persist();
      render();
      break;
    case "collapse":
    case "collapse-menu":
      if (overviewFolded.has(id)) overviewFolded.delete(id); else overviewFolded.add(id);
      state.settings.foldedCollections = [...overviewFolded];
      await persist();
      if (action === "collapse-menu") closeModal();
      render();
      document.querySelector(`.collection-heading-button[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      break;
    case "collapse-all": {
      const allFolded = state.collections.every((c) => overviewFolded.has(c.id));
      state.collections.forEach((c) => allFolded ? overviewFolded.delete(c.id) : overviewFolded.add(c.id));
      state.settings.foldedCollections = [...overviewFolded];
      await persist();
      render();
      document.querySelector(".fold-all")?.focus({ preventScroll: true });
      break;
    }
    case "add-card":
      startCard(
        ui.filter === "all"
          ? "link"
          : ui.filter === "picture"
            ? "file"
            : ui.filter,
        null,
        el.dataset.collectionId,
      );
      break;
    case "add-widget":
      startCard("widget");
      break;
    case "edit-card":
      startCard(null, id);
      break;
    case 'choose-local-file':
      await chooseLocalForForm(el.dataset.kind||'file');
      break;
    case 'clear-local-file':
      captureForm();delete draft.launcher;draft.localHint='';draft.url='';showCardForm();
      break;
    case 'create-demo-space': {
      closePopover();const guest=createDemoSpace(social);await ensureSampleFiles(social.spaces[guest].cards);await switchUser(guest);
      toast('Your demo space is ready. Files, music, widgets and a community to explore.');break;
    }
    case "choose-type":
      captureForm();
      if(draft.type===id)break;
      draft.type = id;
      draft.source = id === "file" ? computerUI.filePreference() : "url";
      delete draft.launcher;delete draft.appLabel;delete draft.appCatalogId;draft.localHint='';
      if (id === "widget") {
        draft.widget ||= "weather";
        draft.color = widgetColors[draft.widget];
        if (!draft.id) {
          draft.title = widgetNames[draft.widget];
          draft.manualTitle = false;
        }
      }
      showCardForm();
      break;
    case "choose-widget":
      captureForm();
      draft.widget = id;
      draft.color = widgetColors[id];
      draft.title = widgetNames[id];
      showCardForm();
      break;
    case "choose-color": {
      if (document.querySelector("#collection-colors"))
        document.querySelector("#collection-colors").dataset.color = id;
      else if (draft) draft.color = id;
      el.closest(".color-options").outerHTML = colorPicker(id);
      break;
    }
    case "find-city":
      await citySearch();
      break;
    case "choose-city": {
      const c = cityResults[Number(id)];
      if (!c) return;
      captureForm();
      Object.assign(draft, {
        city: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
      });
      showCardForm();
      break;
    }
    case "add-collection":
      collectionForm();
      break;
    case "edit-collection":
      collectionForm(id);
      break;
    case "collection-menu":
      collectionMenu(id, el);
      break;
    case "delete-collection":
      deleteCollectionDialog(id);
      break;
    case "collection-earlier":
    case "collection-later": {
      const at = state.collections.findIndex((c) => c.id === id),
        next = at + (action === "collection-earlier" ? -1 : 1);
      if (next < 0 || next >= state.collections.length) {
        toast("Already at the edge of your space.");
        return;
      }
      [state.collections[at], state.collections[next]] = [
        state.collections[next],
        state.collections[at],
      ];
      await persist();
      closeModal();
      render();
      break;
    }
    case "card-menu":
      cardMenu(id, el);
      break;
    case "move-card":
      moveCardDialog(id);
      break;
    case "favorite":
    case "favorite-menu": {
      const c = cardById(id);
      toggleResourceFavorite(social,social.activeUser,social.activeUser,id);
      await persist();
      if (action === "favorite-menu") closeModal();
      render();
      toast(
        c.favorite
          ? "Kept close. Added to favorites."
          : "Removed from favorites.",
      );
      break;
    }
    case "delete-card": {
      const c = cardById(id);
      if (audioId() === id) stopAudio();
      if (playingYouTubeId() === id) stopYouTube();
      closeModal();
      await mutate(
        () => {
          state.cards = state.cards.filter((c) => c.id !== id);
        },
        `“${c.title}” removed.`,
        true,
      );
      break;
    }
    case "play-collection":
      await playCollection(id);
      break;
    case "play-audio-collection":
      await playMusicCollection(id);
      break;
    case "open-card":
      await openCard(cardById(id),el.closest("[data-collection]")?.dataset.collection || cardById(id).collectionId);
      break;
    case "settings":
      settingsDialog();
      break;
    case "shortcuts":
      shortcutsDialog();
      break;
    case "close-dialog":
      closeModal();
      break;
    case "toggle-timer":
      toggleTimer(cardById(id));
      break;
    case "reset-timer":
      resetTimer(cardById(id));
      break;
    case "retry-weather":
      await refreshWeather(cardById(id), true);
      break;
    case "audio-toggle":
      if (activeAudio) {
        if (activeAudio.paused) await activeAudio.play();
        else activeAudio.pause();
        updateAudio();
      }
      break;
    case "audio-previous":
      await advanceAudio(-1);
      break;
    case "audio-next":
      await advanceAudio(1);
      break;
    case "audio-stop":
      stopAudio();
      renderAudioDock();
      updateAudio();
      break;
    case "download-file": {
      const c = cardById(id);
      if (!canViewCard(social, state.cards.includes(c) ? social.activeUser : sharedPlayback?.owner, c, social.activeUser)) throw Error("This file is no longer shared with you.");
      const blob = await getFile(c.fileId);
      if (!blob) throw Error("This file is missing.");
      download(blob, c.fileName);
      break;
    }
    case "reset-confirm":
      resetConfirm(id);
      break;
    case "reset":
      await resetDashboard(id);
      break;
  }
}
document.addEventListener("click", (e) => {
  if (Date.now() < suppressCardClickUntil && e.target.closest("[data-card]")) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  const socialEl = e.target.closest("[data-social]");
  if (socialEl && !socialEl.disabled) {
    e.preventDefault();
    socialUI.click(socialEl).catch((err) => toast(err.message));
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  e.preventDefault();
  handleAction(el.dataset.action, el).catch((err) =>
    toast(err.message || "Something went wrong. Please try again."),
  );
});
function syncSearchControls() {
  const input = document.querySelector("#search, #social-search, #global-query");
  const clear = document.querySelector('[data-action="clear-search"]');
  if (clear) clear.hidden = !input?.value;
  const hint = document.querySelector(".universal-search kbd");
  if (hint) hint.hidden = !!input?.value;
  const fold = document.querySelector(".fold-all");
  if (fold) fold.hidden = !!input?.value || ui.filter !== "all";
}
function clearSearch() {
  const input = document.querySelector("#search, #social-search, #global-query");
  if (!input) return;
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus({ preventScroll: true });
}
function runGlobalSearch(scope) {
  const query = document.querySelector("#search, #social-search, #global-query")?.value || "";
  if (scope === "mine") {
    if (ui.page !== "space") Object.assign(ui, { page:"space", collection:"all", filter:"all" });
    ui.query = query; render(); document.querySelector("#search")?.focus({ preventScroll: true });
  }
  else socialUI.search(scope,query);
  quickSearch.close();
}
document.querySelector("#app").addEventListener("submit", (event) => {
  if (event.target.id !== "global-search-form") return;
  event.preventDefault(); event.stopPropagation();
  runGlobalSearch(document.querySelector("#universal-scope").value);
});
document.addEventListener("input", (e) => {
  const el = e.target;
  const error = el.form?.querySelector("#form-error, .social-form-error");
  if (error) error.textContent = "";
  socialUI?.input(el);
  if (["search", "social-search", "global-query"].includes(el.id)) syncSearchControls();
  if (el.id === "search") {
    ui.query = el.value;
    renderContent();
  }
  if (["search", "social-search", "global-query"].includes(el.id)) quickSearch?.show();
  if (el.dataset.note) {
    const c = cardById(el.dataset.note);
    if (!c) return;
    c.note = el.value;
    const label = document.querySelector(
      `[data-note-status="${CSS.escape(c.id)}"]`,
    );
    if (label) label.textContent = "Saving…";
    clearTimeout(noteTimeout);
    noteTimeout = setTimeout(
      () =>
        persist()
          .then(() => {
            if (label?.isConnected) label.textContent = "Saved just now";
          })
          .catch((err) => toast(err.message)),
      350,
    );
  }
  if (el.id === "card-url") {
    clearTimeout(formTimer);
    formTimer = setTimeout(() => updateURLPreview(), 300);
  }
  if (el.id === "card-title" && draft) draft.manualTitle = !!el.value.trim();
  if (el.id === "city-search") {
    clearTimeout(cityTimer);
    cityTimer = setTimeout(() => {
      if (el.value.trim().length > 2) citySearch();
    }, 650);
  }
  if (
    el.id === "audio-seek" &&
    activeAudio &&
    Number.isFinite(activeAudio.duration)
  )
    activeAudio.currentTime = (Number(el.value) * activeAudio.duration) / 100;
});
document.addEventListener("change", (e) => {
  const el = e.target;
  compareUI?.change(el).catch(err=>toast(err.message));
  spaceTools?.change(el).catch(err=>toast(err.message));
  socialUI?.change(el);
  if(el.dataset.taskCard) { const c=cardById(el.dataset.taskCard);const task=c.tasks?.find(t=>t.id===el.dataset.taskId);if(task){task.done=el.checked;persist().catch(e=>toast(e.message));} }
  if(el.name==='primarySubject')refreshDetailFields(el.form);
  if(el.id==="collection-folder") { document.querySelector("#new-folder-field").hidden=el.value!=="__new"; }
  if (el.id === "dashboard-view" && el.value in VIEWS) { state.settings.view = el.value; persist().then(render).catch(e => toast(e.message)); }
  if (el.id === "universal-scope") { ui.searchScope=el.value;quickSearch.show(); }
  if (el.id === "audio-repeat") setAudioRepeat(el.value);
  if (el.name === "media-source") {
    captureForm();
    draft.source = el.value;
    computerUI.rememberFileChoice(el.value);
    showCardForm();
  }
  if (el.name === "collectionId") {
    const field = document.querySelector("#new-collection-field");
    if (field) {
      field.hidden = el.value !== "__new";
      field.querySelector("input").required = el.value === "__new";
    }
  }
  if (el.id === "card-upload" && draft) {
    const file = el.files[0];
    if (!file) return;
    acceptCardFile(file,'upload').catch(error=>toast(error.message));
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (submittingForms.has(form)) return;
  submittingForms.add(form);
  form.setAttribute("aria-busy", "true");
  const submit = e.submitter || document.querySelector(`[type=submit][form="${form.id}"]`);
  if (submit) submit.disabled = true;
  try {
    if(await computerUI?.submit(form))return;
    if(form.classList.contains('currency-inline')){const c=cardById(form.dataset.cardId);c.amount=Number(form.elements.amount.value);await persist();render();return;}
    if(await spaceTools?.submit(form))return;
    if (form.id.startsWith("social-")) { await socialUI.submit(form); return; }
    if(form.classList.contains("widget-task-form")) { const value=form.elements.task.value.trim();if(!value)throw Error("Write a task first.");const card=cardById(form.dataset.cardId);card.tasks ||= [];card.tasks.push({id:uid(),text:value,done:false});await persist();render();document.querySelector(`[data-card-id="${CSS.escape(card.id)}"] input`)?.focus();return; }
    if(form.id==='folder-form') { const name=form.elements.name.value.trim();if(!name)throw Error('Give the folder a name.');state.folders.find(f=>f.id===form.dataset.id).name=name;await persist();closeModal();render();return; }
    if(form.id==='organize-card-form') { const card=cardById(form.dataset.id);card.collectionIds=[...form.querySelectorAll('[name="placements"]:checked')].map(el=>el.value).filter(id=>id!==card.collectionId);card.subjects=[...new Set([form.elements.primarySubject.value,form.elements.secondarySubject.value,...subjectIds(card).slice(2)].filter(Boolean))];card.contentKind=form.elements.contentKind.value;card.creator=form.elements.creator.value.trim();card.tags=cleanTags(form.elements.tags.value);card.progress=form.elements.progress.value;for(const field of ['artist','genre','decade'])card[field]=form.elements[field].value.trim();card.year=Number(form.elements.year.value)||null;if(card.year)card.decade=`${Math.floor(card.year/10)*10}s`;await persist();closeModal();render();toast('Your card is organized.');return; }
    if (form.id === "card-form") await saveCardForm(form);
    if (form.id === "collection-form") await saveCollection(form);
    if (form.id === "move-form") {
      const id = form.dataset.id;
      const target = form.elements.collection.value;
      await mutate(() => moveCard(state, id, target), "Card moved.");
      closeModal();
    }
    if (form.id === "delete-collection-form") {
      const id = form.dataset.id;
      const target = form.elements.target?.value || "__delete";
      await mutate(
        () => {
          state.collections = state.collections.filter((c) => c.id !== id);
          state.cards.forEach(c=>{c.collectionIds=(c.collectionIds||[]).filter(ref=>ref!==id);});
          if (target === "__delete") {
            if (
              state.cards.some(
                (c) => c.collectionId === id && c.id === audioId(),
              )
            )
              stopAudio();
            state.cards = state.cards.filter((c) => c.collectionId !== id);
          } else
            state.cards
              .filter((c) => c.collectionId === id)
              .forEach((c) => (c.collectionId = target));
          if (ui.collection === id) ui.collection = "all";
        },
        "Collection removed.",
        true,
      );
      closeModal();
    }
    if (form.id === "settings-form") {
      state.settings = {
        ...state.settings,
        name: form.elements.name.value.trim() || "You",
        title: form.elements.title.value.trim() || "Your own little universe.",
        subtitle: form.elements.subtitle.value.trim(),
        ...appearanceSettings(form.elements.appearance.value),
        view: form.elements.view.value,
        sidebarMode: form.elements.sidebarMode.value,
        sidebarCollapsed: form.elements.sidebarMode.value === "compact",
      };
      await persist();
      closeModal();
      render();
      toast("A little more you.");
    }
  } catch (err) {
    const box = form.querySelector("#form-error, .social-form-error");
    if (box) box.textContent = err.message;
    else toast(err.message);
  } finally {
    submittingForms.delete(form);
    form.removeAttribute("aria-busy");
    if (submit?.isConnected) submit.disabled = false;
    if (form.isConnected && form.id === "social-message-form") socialUI.input(form.elements.message);
  }
});
document.addEventListener("contextmenu", e => {
  const card = e.target.closest('[data-card][data-collection]');
  if (ui.page !== 'space' || !card || e.target.closest('input,textarea,select,[contenteditable=true]')) return;
  e.preventDefault(); cardMenu(card.dataset.card, card.querySelector('[data-action="card-menu"]'));
});
document.addEventListener("keydown", (e) => {
  if (sidebarDrawer.matches && ui.mobile && !dialog.open) {
    if (e.key === "Escape") { e.preventDefault(); closeSidebarDrawer(true); return; }
    if (e.key === "Tab") {
      const items = [...document.querySelectorAll('#main-sidebar button:not(:disabled),#main-sidebar a[href]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (e.key === 'Escape' && ['search','social-search','global-query'].includes(e.target.id) && e.target.value) {
    e.preventDefault(); clearSearch(); return;
  }
  if (e.target.id === "message-text" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault(); e.target.form?.requestSubmit(); return;
  }
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.target.closest("input,textarea,select,[contenteditable=true]")
  )
    return;
  if (dialog.open) return;
  if (e.key === "/") {
    e.preventDefault();
    document.querySelector("#search, #social-search, #global-query")?.focus();
  }
  if (e.key.toLowerCase() === "n") {
    e.preventDefault();
    startCard();
  }
  if (e.key.toLowerCase() === "v") {
    e.preventDefault();
    const views = Object.keys(VIEWS);
    state.settings.view = views[(views.indexOf(state.settings.view) + 1) % views.length];
    persist()
      .then(render)
      .catch((err) => toast(err.message));
  }
  if (e.key.toLowerCase() === "t") {
    e.preventDefault();
    Object.assign(state.settings, appearanceSettings(nextDarkAppearance(state.settings)));
    persist()
      .then(render)
      .catch((err) => toast(err.message));
  }
  if (e.key === "?") {
    e.preventDefault();
    shortcutsDialog();
  }
});
function clearDropHints() {
  document.querySelectorAll('.drag-over,.drop-before,.drop-after').forEach(el => el.classList.remove('drag-over','drop-before','drop-after'));
}
function finishDrag() {
  if (drag) suppressCardClickUntil = Date.now() + 450;
  drag = null; dragPointer = null; dragBlocked = false;
  cancelAnimationFrame(dragFrame); dragFrame = null;
  document.body.classList.remove('arranging-cards'); clearDropHints();
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}
function dropPosition(target, x, y) {
  const collection = target?.closest('[data-drop-collection]');
  if (!collection || !drag) return null;
  const collectionId = collection.dataset.dropCollection;
  const card = target.closest('[data-card][data-collection]');
  if (!card || card.dataset.card === drag.id) return { collection, collectionId, beforeId: card?.dataset.card || null };
  const rect = card.getBoundingClientRect();
  const after = state.settings.view === 'list' ? y > rect.top + rect.height / 2 : x > rect.left + rect.width / 2;
  const order = state.cards.filter(c => c.collectionId === collectionId && c.id !== drag.id);
  const at = order.findIndex(c => c.id === card.dataset.card);
  return { collection, collectionId, card, after, beforeId: after ? order[at + 1]?.id || null : card.dataset.card };
}
function paintDropHint(target, x, y) {
  clearDropHints();
  const position = dropPosition(target,x,y);
  if (!position) return;
  if (position.card) position.card.classList.add(position.after ? 'drop-after' : 'drop-before');
  else if (position.beforeId !== drag.id) position.collection.classList.add('drag-over');
}
function scrollDuringDrag() {
  if (!drag || !dragPointer) { dragFrame = null; return; }
  const { x,y } = dragPointer;
  const hit = document.elementFromPoint(x,y);
  const edgeSpeed = (point, start, end, edge = 48) => point < start + edge ? -Math.min(12,Math.max(0,(start + edge - point) / 4)) : point > end - edge ? Math.min(12,Math.max(0,(point - end + edge) / 4)) : 0;
  const rail = hit?.closest('[data-rail]');
  if (rail && rail.scrollWidth > rail.clientWidth + 2) { const r = rail.getBoundingClientRect(); rail.scrollLeft += edgeSpeed(x,r.left,r.right); }
  const sidebar = hit?.closest('#collection-nav');
  if (sidebar) { const r = sidebar.getBoundingClientRect(); sidebar.scrollTop += edgeSpeed(y,r.top,r.bottom); }
  else if (!hit?.closest('.sidebar')) window.scrollBy(0,edgeSpeed(y,0,innerHeight,65));
  paintDropHint(document.elementFromPoint(x,y),x,y);
  dragFrame = requestAnimationFrame(scrollDuringDrag);
}
function restoreDragSurface() { if (blockedDragCard?.isConnected) blockedDragCard.draggable = true; blockedDragCard = null; }
document.addEventListener('pointerup', restoreDragSurface, true);
document.addEventListener('pointercancel', restoreDragSurface, true);
document.addEventListener('pointerdown', e => {
  restoreDragSurface();
  dragBlocked = !!e.target.closest('input,textarea,select,a,[contenteditable=true],button:not(.card-main),.inline-card-discussion');
  const card = e.target.closest('.card[draggable="true"]');
  if (dragBlocked && card) { blockedDragCard = card; card.draggable = false; }
}, true);
document.addEventListener('dragstart', e => {
  const card = e.target.closest('[data-card][data-collection]');
  if (dragBlocked) return;
  if (ui.page !== 'space' || !card || card.classList.contains('social-card')) { e.preventDefault(); return; }
  const id = card.dataset.card, original = cardById(id);
  const order = state.cards.filter(c => c.collectionId === original.collectionId);
  drag = { id, from: original.collectionId, next: order[order.findIndex(c => c.id === id) + 1]?.id || null };
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
  const r = card.getBoundingClientRect(); e.dataTransfer.setDragImage(card, Math.max(0,e.clientX-r.left), Math.max(0,e.clientY-r.top));
  document.body.classList.add('arranging-cards');
  setTimeout(() => { if (drag?.id === id) card.classList.add('dragging'); },0);
});
document.addEventListener('dragover', e => {
  if (!drag) return;
  dragPointer = { x:e.clientX, y:e.clientY };
  if (!dragFrame) dragFrame = requestAnimationFrame(scrollDuringDrag);
  const position = dropPosition(e.target,e.clientX,e.clientY);
  if (!position) { clearDropHints(); return; }
  e.preventDefault(); e.dataTransfer.dropEffect = 'move'; paintDropHint(e.target,e.clientX,e.clientY);
});
document.addEventListener('drop', async e => {
  if (!drag) return;
  e.preventDefault();
  const previous = { ...drag }, position = dropPosition(e.target,e.clientX,e.clientY);
  finishDrag();
  if (!position || (position.collectionId === previous.from && position.beforeId === previous.next)) return;
  if (!moveCard(state,previous.id,position.collectionId,position.beforeId)) return;
  try {
    await persist(); render();
    toast(position.collectionId === previous.from ? 'Card rearranged.' : 'Moved to ' + collectionById(position.collectionId).name + '.', () => {
      if (!cardById(previous.id) || !collectionById(previous.from)) { toast('The original collection is no longer available.'); return; }
      moveCard(state,previous.id,previous.from,previous.next);
      persist().then(() => { render(); toast('Move undone.'); }).catch(err => toast(err.message));
    });
  } catch (err) { toast(err.message); }
});
document.addEventListener('dragend', finishDrag);
window.addEventListener('blur', finishDrag);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state && noteTimeout) {
    clearTimeout(noteTimeout);
    noteTimeout = null;
    persist().catch(() => {});
  }
});

function stopPlayback({ keepFlow = false } = {}) {
  if (!keepFlow) stopFlowMedia();
  stopYouTube();
  stopAudio();
  sharedPlayback = null;
  if (document.querySelector("#audio-host")) renderAudioDock();
}
async function switchUser(id) {
  if (!social.spaces[id]) return;
  clearTimeout(noteTimeout);
  await persist();
  stopPlayback();
  clearTimers();
  social.activeUser = id;
  state = social.spaces[id];
  overviewFolded.clear();
  (state.settings.foldedCollections || []).forEach(id => overviewFolded.add(id));
  Object.assign(ui, { page: "space", collection: "all", query: "", filter: "all", mobile: false });
  closeModal();
  await persist();
  render();
  window.scrollTo(0, 0);
  toast(`You’re in ${social.profiles[id].name}’s space.`);
}
async function ensureSampleFiles(cards) {
  for(const card of cards){
    if(!card.fileId||await getFile(card.fileId))continue;
    if(card.fileId==='welcome-file'){await putFile(card.fileId,new Blob([welcomeText],{type:'text/plain'}));continue;}
    if(!['sample-budget','sample-weekend-plans','sample-slides','sample-packing','audio-morning-light'].includes(card.fileId))continue;
    const response=await fetch(`/universal/assets/samples/${card.fileId}.${fileKind(card.fileName).ext}`);
    if(!response.ok)throw Error('A sample file could not be loaded. Please try again.');
    await putFile(card.fileId,new Blob([await response.arrayBuffer()],{type:card.mime}));
  }
}
async function rememberOpened(owner,card){
  if(!card)return;
  state.recentCards=[{id:card.id,owner,openedAt:Date.now()},...(state.recentCards||[]).filter(r=>r.owner!==owner||r.id!==card.id)].slice(0,40);
  const smartChanged=markResourceSeen(social,social.activeUser,owner,card);
  const followedChanged=markFollowedResourceSeen(social,social.activeUser,resourceKey(card,owner));
  await persist();if(smartChanged||followedChanged)render();
  else for(const c of state.cards.filter(c=>c.widget==="continue"))document.querySelectorAll(`[data-widget="${CSS.escape(c.id)}"]`).forEach(n=>n.innerHTML=dashboardWidget(c));
}
async function openShared(owner, card, allowedCards = null) {
  await openSharedContent(owner,card,allowedCards);
  await rememberOpened(owner,card);
}
async function openSharedContent(owner, card, allowedCards = null) {
  stopFlowMedia();
  if (!canViewCard(social, owner, card, social.activeUser)) throw Error("This card is no longer shared with you.");
  if (card.type === "widget") {
    modal(card.title, "A shared widget", `<p class="form-hint">${esc(card.widget === "note" ? card.note || "No note yet." : "Choose Add card, then Widget, to add your own version.")}</p>`);
    return;
  }
  if (owner === social.activeUser && !allowedCards) { await openCard(card); return; }
  const space = social.spaces[owner];
  const cards = (allowedCards || space.cards).filter((c) => canViewCard(social, owner, c, social.activeUser));
  sharedPlayback = { owner, cards };
  if (card.type === "video" && videoSource(card.url)?.provider === "youtube") {
    stopAudio(); renderAudioDock();
    const queue = collectionQueue(cards, card.collectionId);
    await openYouTubeQueue(queue, space.collections.find((c) => c.id === card.collectionId)?.name || "Shared collection", Math.max(0, queue.findIndex((c) => c.id === card.id)));
    return;
  }
  if (card.type === "audio" && !audioEmbed(card.url)) {
    stopYouTube();
    await playAudio(card, updateAudio, audioCollectionQueue(cards, card.collectionId), toast);
    return;
  }
  if (card.type === "file" && !card.fileId && fileKind(card.fileName || card.url, card.mime).label === "Photo") {
    modal(card.title, card.description, `<div class="photo-preview"><img src="${esc(card.url)}" alt="${esc(card.title)}"></div>`, card.sourceURL ? `<a class="secondary" href="${esc(card.sourceURL)}" target="_blank" rel="noopener">View source ${icon("arrow")}</a>` : "", true);
    return;
  }
  await openCard(card);
}
document.addEventListener("input",e=>compareUI?.input(e.target));
async function init() {
  if (await migrateLocalAddress()) return;
  const stored = await getState();
  if (stored) {
    state = validateState(stored);
    if (expandCatalog(state)) await saveState(state);
  } else {
    state = seedState();
    await replaceAll(
      state,
      new Map([
        ["welcome-file", new Blob([welcomeText], { type: "text/plain" })],
      ]),
    );
  }
  social = await getSocialState();
  const isNewSocial = !social;
  if (!social) social = createSocial(state);
  else social.spaces.xavier = state;
  persistenceBase = structuredClone(social);
  upgradeCommunity(social);
  upgradeNetwork(social);
  upgradeLiveCollections(social);
  upgradeDiscoveryCommunity(social);
  upgradePersonalOrganization(social);
  upgradeConnectedSpace(social);
  upgradeStarterLibrary(social);
  upgradeCommunityBrain(social);
  upgradeCollaborativeCollections(social);
  upgradeResourceConnections(social);
  upgradeDashboardHighlights(social);
  upgradeCollectionExperience(social);
  upgradeUsefulWidgets(social);
  upgradeFinalDemo(social);
  upgradeDocumentSample(social);
  Object.values(social.spaces).forEach(upgradePresentation);
  if (!social.spaces[social.activeUser] || social.profiles[social.activeUser]?.role==='curator') social.activeUser = "xavier";
  state = social.spaces[social.activeUser];
  (state.settings.foldedCollections || []).forEach(id => overviewFolded.add(id));
  socialUI = createSocialUI({ data: () => social, state: () => state, ui: () => ui,
    modal, closeModal, render, persist, hydrate, cardVisual, cardInfo, toast, switchUser, openShared, stopPlayback, renderArrivals: () => highlightsUI.renderFeed(), topbar: renderTop, addCard: id => startCard("link", null, id) });
  computerUI=createComputerUI({data:()=>social,state:()=>state,ui:()=>ui,modal,closeModal,closePopover,render,persist,toast,refreshState:()=>{state=social.spaces[social.activeUser];},acceptFormFile:acceptCardFile,acceptFormFolder:async()=>{if(!draft||draft.type!=='file')return false;await chooseLocalForForm('folder');return true;},acceptFormLink:url=>{if(!draft)return;captureForm();delete draft.launcher;draft.source='url';draft.url=safeURL(url);draft.localHint='';showCardForm();updateURLPreview();},openAppForm:(collectionId,id,hint)=>startCard('app',id||null,collectionId,hint),selectApp:({launcher,label,appId})=>{
    if(draft?.type!=='app'||!document.querySelector('#card-form'))return false;
    captureForm();Object.assign(draft,{launcher,appLabel:label,appCatalogId:appId,source:'url',url:'',selectedFile:null});
    delete draft.fileId;delete draft.fileName;delete draft.fileSize;delete draft.mime;
    if(!draft.manualTitle||!draft.title.trim()){draft.title=label.replace(/\.(exe|lnk)$/i,'');document.querySelector('#card-title').value=draft.title;}
    document.querySelector('#form-error').textContent='';return true;
  },editLocal:(id,hint)=>startCard('file',id,null,hint)});
  spaceTools = createSpaceTools({data:()=>social,state:()=>state,ui:()=>ui,modal,closeModal,render,persist,toast});
  collectionExperienceUI=createCollectionExperienceUI({data:()=>social,cardVisual,persist,render,toast});
  highlightsUI = createHighlightsUI({data:()=>social,ui:()=>ui,cardVisual,persist,render,openShared,toast,closeModal});
  compareUI = createCompareUI({data:()=>social,ui:()=>ui,top:renderTop,visual:cardVisual,closeModal,render,persist,toast});
  quickSearch = createQuickSearch({ data: () => social, hydrate, persist, addWidget: spec => { startCard('widget');Object.assign(draft,spec,{title:widgetNames[spec.widget],color:widgetColors[spec.widget]});showCardForm(); } });
  if (isNewSocial) ui.page = "space";
  for (const card of Object.values(social.spaces).flatMap((s) => s.cards).filter((c) =>
    ["sample-budget", "sample-weekend-plans", "sample-slides", "sample-packing", "audio-morning-light"].includes(c.fileId),
  )) {
    if (!(await getFile(card.fileId))) {
      const response = await fetch(
        `/universal/assets/samples/${card.fileId}.${fileKind(card.fileName).ext}`,
      );
      if (!response.ok) throw Error("A sample file could not be loaded.");
      await putFile(
        card.fileId,
        new Blob([await response.arrayBuffer()], { type: card.mime }),
      );
    }
  }
  await persist();
  render();
}
init().catch((err) => {
  app.innerHTML = `<div class="boot"><div class="startup-error"><h1>Your space couldn’t open.</h1><p>${esc(err.message)}</p><p>Try a normal browser window with site storage enabled. Your saved dashboard has not been reset.</p><button class="secondary" onclick="location.reload()">Try again</button></div></div>`;
});
