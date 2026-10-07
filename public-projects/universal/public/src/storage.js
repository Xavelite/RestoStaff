import { mergeSocial } from './state-merge.js';
import { reconcileCommunityLibrary } from './community-brain.js';
let connection;
export async function openDB() {
  if (connection) return connection;
  connection = await new Promise((resolve, reject) => {
    const req = indexedDB.open("universal-dashboard", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("state");
      req.result.createObjectStore("files");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return connection;
}
export async function getState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("state").objectStore("state").get("dashboard");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveState(state) {
  const db = await openDB();
  const snapshot = structuredClone(state);
  snapshot.updatedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(snapshot, "dashboard");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function getSocialState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("state").objectStore("state").get("social");
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}
export async function saveSocialState(data, base = null) {
  const db = await openDB();
  const snapshot = structuredClone(data);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    const store = tx.objectStore("state");
    let merged = snapshot;
    const read = store.get("social");
    read.onsuccess = () => {
      merged = base && read.result ? mergeSocial(base, snapshot, read.result) : snapshot;
      reconcileCommunityLibrary(merged);
      store.put(merged, "social");
      store.put(merged.spaces.xavier, "dashboard");
    };
    tx.oncomplete = () => resolve(merged);
    tx.onerror = reject;
  });
}
export async function getFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function putFile(id, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function replaceAll(state, files) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["state", "files"], "readwrite");
    tx.objectStore("files").clear();
    for (const [id, blob] of files) tx.objectStore("files").put(blob, id);
    tx.objectStore("state").put(state, "dashboard");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export const welcomeText =
  "WELCOME TO YOUR UNIVERSE\n\nA place for the links, files, sounds and little things you want to keep close.\n\nStart anywhere\nAdd a website: paste a URL and we will find its logo.\nMake it yours: create a collection and drag cards into it.\nKeep a thought: notes save as you write.\nTake a breath: start a focus timer or play Slow orbit.\n\nYour dashboard lives in this browser. Files you add stay here too. Use the sidebar to explore your collections. Music collections can play their YouTube videos in a repeating queue.\n\nKeyboard shortcuts\n/ Search\nN Add a card\nV Change the view\n? Show all shortcuts\n\nBuilt for a little less searching, and a little more living.";
export async function exportBackup(state) {
  const files = [];
  for (const id of new Set(state.cards.flatMap((c) => [c.fileId,c.coverFileId]).filter(Boolean))) {
    const blob = await getFile(id);
    if (!blob)
      throw Error(
        "A saved file is missing. Remove or replace that card before exporting.",
      );
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    files.push({ id, data });
  }
  return {
    format: "universal-backup",
    exportedAt: new Date().toISOString(),
    state,
    files,
  };
}
export function decodeFiles(input, state) {
  if (!Array.isArray(input) || input.length > 5000)
    throw Error("Invalid backup files.");
  const files = new Map();
  let bytes = 0;
  for (const file of input) {
    if (
      typeof file.id !== "string" ||
      files.has(file.id) ||
      typeof file.data !== "string"
    )
      throw Error("Invalid backup file.");
    const match = file.data.match(/^data:([^;,]*);base64,([A-Za-z0-9+/=]*)$/);
    if (!match) throw Error("Invalid file data in backup.");
    const binary = atob(match[2]);
    bytes += binary.length;
    if (bytes > 100 * 1024 * 1024)
      throw Error("Backup exceeds the 100 MB import limit.");
    files.set(
      file.id,
      new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], {
        type: match[1] || "application/octet-stream",
      }),
    );
  }
  for (const c of state.cards)
    if ((c.fileId && !files.has(c.fileId)) || (c.coverFileId && !files.has(c.coverFileId)))
      throw Error("This backup is missing an attached file.");
  return files;
}
