import { validLauncher, launcherIcon } from './local-items.js';
import { smartRules } from './smart-rules.js';
import { subjectIds, CONTENT_KINDS } from './topics.js';
import { cleanTags, inCollection, matchResource, PROGRESS } from "./classification.js";
import {
  CATALOG_VERSION,
  catalogCollections,
  catalogCards,
} from "./catalog.js";
export const TYPES = ["link", "file", "video", "audio", "widget"];
export const WIDGETS = ["weather", "clock", "note", "focus", "tasks", "continue", "updates", "currency", "crypto", "news", "countdown", "rediscover"];
export const COLORS = ["sage", "blue", "rose", "amber", "violet", "neutral"];
export const uid = () => crypto.randomUUID();
export const isLocalAudioURL = (url) => [
  "/universal/assets/slow-orbit.wav", "/universal/assets/blue-hour.wav", "/universal/assets/afterglow.wav",
].includes(url);
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function safeURL(input) {
  let raw = String(input || "").trim();
  if (!raw) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = "https://" + raw;
  try {
    const u = new URL(raw);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export function domain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function logoForURL(url) {
  const host = domain(url);
  const products = {
    "mail.google.com": "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
    "drive.google.com":
      "https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png",
    "calendar.google.com": `https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_${new Date().getDate()}.ico`,
  };
  return (
    products[host] ||
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`
  );
}
const brands = {
  "youtube.com": ["YouTube", "rose"],
  "youtu.be": ["YouTube", "rose"],
  "notion.so": ["Notion", "sage"],
  "notion.com": ["Notion", "sage"],
  "figma.com": ["Figma", "violet"],
  "github.com": ["GitHub", "blue"],
  "chatgpt.com": ["ChatGPT", "sage"],
  "openai.com": ["OpenAI", "sage"],
  "spotify.com": ["Spotify", "sage"],
  "pinterest.com": ["Pinterest", "rose"],
  "netflix.com": ["Netflix", "rose"],
  "are.na": ["Are.na", "amber"],
  "linear.app": ["Linear", "violet"],
  "wikipedia.org": ["Wikipedia", "blue"],
  "mail.google.com": ["Gmail", "rose"],
  "drive.google.com": ["Google Drive", "amber"],
};
export function metadata(url) {
  const host = domain(url);
  const key = Object.keys(brands).find(
    (k) => host === k || host.endsWith("." + k),
  );
  return {
    title: key
      ? brands[key][0]
      : host.split(".")[0].replace(/^./, (c) => c.toUpperCase()),
    color: key ? brands[key][1] : "blue",
    host,
  };
}
export function videoSource(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    let id = "";
    if (h === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    if (h === "youtube.com" || h === "m.youtube.com")
      id =
        u.searchParams.get("v") ||
        u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ||
        "";
    if (/^[\w-]{11}$/.test(id))
      return {
        provider: "youtube",
        id,
        embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
      };
    if (h === "vimeo.com" && /^\/\d+/.test(u.pathname)) {
      id = u.pathname.match(/\d+/)[0];
      return {
        provider: "vimeo",
        id,
        embed: `https://player.vimeo.com/video/${id}?autoplay=1`,
      };
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { provider: "direct" };
  } catch {}
  return null;
}
export function seedState() {
  return {
    version: 1,
    catalogVersion: CATALOG_VERSION,
    collections: structuredClone(catalogCollections),
    cards: catalogCards(),
    settings: {
      name: "Xavier",
      title: "Your own little universe.",
      subtitle: "All the things you love, in a space that’s yours.",
      theme: "light",
      palette: "aurora",
      view: "classic",
    },
    updatedAt: Date.now(),
  };
}
export function validateState(input) {
  if (
    !input ||
    input.version !== 1 ||
    !Array.isArray(input.collections) ||
    !Array.isArray(input.cards) ||
    input.collections.length > 200 ||
    input.cards.length > 5000
  )
    throw Error("This is not a supported Universal backup.");
  const s = structuredClone(input);
  const ids = new Set();
  for (const c of s.collections) {
    if (
      !c ||
      typeof c.id !== "string" ||
      ids.has(c.id) ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 80
    )
      throw Error("The backup contains an invalid collection.");
    ids.add(c.id);
    c.color = COLORS.includes(c.color) ? c.color : "sage";
    c.description = String(c.description || "").slice(0, 200);
    c.icon = String(c.icon || "collection");
    c.collapsed = !!c.collapsed;
    if(c.smart&&typeof c.smart==='object') {
      const cleanKeys=value=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string').map(v=>v.slice(0,2000)))].slice(0,1000):[];
      c.smart={enabled:!!c.smart.enabled,rules:smartRules(c.smart.rules),paused:!!c.smart.paused,newTracking:!!c.smart.newTracking,hidden:cleanKeys(c.smart.hidden),seen:cleanKeys(c.smart.seen),snapshot:cleanKeys(c.smart.snapshot)};
    } else delete c.smart;
  }
  s.folders = (Array.isArray(s.folders) ? s.folders : []).filter(f => f && typeof f.id === "string" && typeof f.name === "string").slice(0,50).map(f=>({id:f.id,name:f.name.slice(0,60),collapsed:!!f.collapsed}));
  s.savedSearches = (Array.isArray(s.savedSearches) ? s.savedSearches : []).filter(s=>s && typeof s.id === "string" && typeof s.name === "string" && s.options && typeof s.options === "object").slice(0,100);
  for(const c of s.collections) if(!s.folders.some(f=>f.id===c.folderId)) delete c.folderId;
  const cardIds = new Set();
  for (const c of s.cards) {
    if (
      !c ||
      typeof c.id !== "string" ||
      cardIds.has(c.id) ||
      !ids.has(c.collectionId) ||
      !TYPES.includes(c.type) ||
      typeof c.title !== "string" ||
      !c.title.trim() ||
      c.title.length > 160
    )
      throw Error("The backup contains an invalid card.");
    cardIds.add(c.id);
    c.description = String(c.description || "").slice(0, 500);
    c.note = String(c.note || "").slice(0, 10000);
    c.favorite = !!c.favorite;
    c.tags=cleanTags(c.tags);
    c.subjects=subjectIds(c).slice(0,8);
    c.contentKind=Object.hasOwn(CONTENT_KINDS,c.contentKind)?c.contentKind:'';
    c.creator=String(c.creator||'').slice(0,100);
    c.tasks=(Array.isArray(c.tasks)?c.tasks:[]).filter(t=>t && typeof t.id==="string" && typeof t.text==="string").slice(0,100).map(t=>({id:t.id,text:t.text.slice(0,120),done:!!t.done}));
    c.collectionIds=[...new Set((Array.isArray(c.collectionIds)?c.collectionIds:[]).filter(id=>ids.has(id)&&id!==c.collectionId))];
    c.progress=Object.hasOwn(PROGRESS,c.progress)?c.progress:"none";
    for(const field of ["artist","genre","decade","album","series"]) c[field]=String(c[field]||"").slice(0,100);
    c.year=Number.isInteger(Number(c.year)) && Number(c.year)>=1000 && Number(c.year)<=2100?Number(c.year):null;
    c.color = COLORS.includes(c.color) ? c.color : "sage";
    if (c.type === "widget" && !WIDGETS.includes(c.widget))
      throw Error("Unknown widget in this backup.");
    if (c.url != null && typeof c.url !== "string")
      throw Error("Invalid link in this backup.");
    c.url = c.url || "";
    if (c.url && !safeURL(c.url) && !isLocalAudioURL(c.url))
      throw Error("Unsafe link in this backup.");
    if (c.fileId && typeof c.fileId !== "string")
      throw Error("Invalid file reference.");
    if (c.fileId && (typeof c.fileName !== "string" || !c.fileName.trim()))
      throw Error("Invalid attachment name.");
    if(c.launcher&&!validLauncher(c.launcher))throw Error("Invalid computer launcher.");
    if(c.launcher){c.type="file";c.visibility="private";c.launcher.icon=launcherIcon(c.launcher.icon);}
    if(c.coverFileId&&typeof c.coverFileId!=="string")throw Error("Invalid cover reference.");
    if (c.type !== "widget" && !c.fileId && !c.url && !c.launcher)
      throw Error("A card is missing its link or attachment.");
    c.fileName = String(c.fileName || "").slice(0, 255);
    c.mime = String(c.mime || "");
    c.minutes = Math.max(1, Math.min(180, Number(c.minutes) || 25));
    c.latitude = Number.isFinite(Number(c.latitude))
      ? Math.max(-90, Math.min(90, Number(c.latitude)))
      : 50.85;
    c.longitude = Number.isFinite(Number(c.longitude))
      ? Math.max(-180, Math.min(180, Number(c.longitude)))
      : 4.35;
    c.city = String(c.city || "Brussels").slice(0, 100);
    c.timezone =
      typeof c.timezone === "string" && c.timezone
        ? c.timezone
        : "Europe/Brussels";
    try {
      new Intl.DateTimeFormat("en", { timeZone: c.timezone });
    } catch {
      c.timezone = "Europe/Brussels";
    }
    c.createdAt = Number(c.createdAt) || Date.now();
  }
  const p = s.settings || {};
  s.settings = {
    name: String(p.name || "You").slice(0, 40),
    title: String(p.title || "Your own little universe.").slice(0, 90),
    subtitle: String(p.subtitle || "Everything you love, in one place.").slice(
      0,
      150,
    ),
    sidebarCollapsed: !!p.sidebarCollapsed,
    sidebarMode: ["auto", "expanded", "compact"].includes(p.sidebarMode) ? p.sidebarMode : p.sidebarCollapsed ? "compact" : "auto",
    groupCollections: !!p.groupCollections,
    webSuggestions: !!p.webSuggestions,
    foldedCollections: Array.isArray(p.foldedCollections) ? [...new Set(p.foldedCollections.filter(id => s.collections.some(c => c.id === id)))] : [],
    theme: p.theme === "dark" ? "dark" : "light",
    palette: ["aurora", "nocturne", "classic"].includes(p.palette) ? p.palette : "aurora",
    view: ["adaptive", "classic", "compact", "list"].includes(p.view) ? p.view : "adaptive",
  };
  s.updatedAt = Date.now();
  return s;
}
export function moveCard(state, id, collectionId, beforeId = null) {
  const index = state.cards.findIndex((c) => c.id === id);
  if (
    index < 0 ||
    !state.collections.some((c) => c.id === collectionId) ||
    beforeId === id
  )
    return false;
  const [card] = state.cards.splice(index, 1);
  card.collectionId = collectionId;
  card.collectionIds=(card.collectionIds||[]).filter(id=>id!==collectionId);
  const before = beforeId
    ? state.cards.findIndex(
        (c) => c.id === beforeId && c.collectionId === collectionId,
      )
    : -1;
  if (before < 0) state.cards.push(card);
  else state.cards.splice(before, 0, card);
  return true;
}
export function matches(card, query) { return matchResource(card,query,card.widget||"",true).matches; }
export function formatBytes(n) {
  return n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${Math.round(n / 1024)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
}
