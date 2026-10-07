import { getFile } from "./storage.js";
import { videoSource, escapeHTML as esc } from "./model.js";
import { nextQueueIndex } from "./playlist.js";
export let activeAudio = null;
let activeId = null;
let objectURL = null;
let queue = [], queueIndex = -1, repeat = "all", generation = 0;
let notify = () => {}, reportError = () => {};
let loading = false, error = "";
export function audioId() {
  return activeId;
}
export function audioPlayback() {
  return { index: queueIndex, length: queue.length, repeat, loading, error };
}
export function setAudioRepeat(value) {
  if (["all", "one", "off"].includes(value)) repeat = value;
  notify();
}
function releaseAudio() {
  generation++;
  if (activeAudio) {
    activeAudio.onended = activeAudio.ontimeupdate = activeAudio.onpause = null;
    activeAudio.onplay = activeAudio.onerror = activeAudio.onloadedmetadata = null;
    activeAudio.pause();
    activeAudio.src = "";
  }
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = null;
  activeAudio = null;
  activeId = null;
}
export function stopAudio() {
  releaseAudio();
  queue = [];
  queueIndex = -1;
  loading = false;
  error = "";
}
export async function playAudio(card, onUpdate, cards = [card], onError = () => {}) {
  notify = onUpdate;
  reportError = onError;
  if (activeId === card.id && activeAudio) {
    if (activeAudio.paused) await activeAudio.play();
    else activeAudio.pause();
    notify();
    return;
  }
  queue = cards.some((c) => c.id === card.id) ? [...cards] : [card];
  repeat = "all";
  await loadAudioTrack(queue.findIndex((c) => c.id === card.id));
}
async function loadAudioTrack(index) {
  releaseAudio();
  const token = generation;
  queueIndex = index;
  const card = queue[index];
  const audio = new Audio();
  activeAudio = audio;
  activeId = card.id;
  loading = true;
  error = "";
  audio.onended = () => advanceAudio(1, true).catch((err) => reportError(err.message));
  audio.ontimeupdate = () => notify();
  audio.onpause = () => notify();
  audio.onloadedmetadata = () => notify();
  audio.onplay = () => { loading = false; error = ""; notify(); };
  const failed = () => {
    loading = false;
    error = "This audio could not play. Try Next, or check its file or direct audio link.";
    notify();
  };
  audio.onerror = failed;
  notify();
  try {
    let src = card.url;
    if (card.fileId) {
      const blob = await getFile(card.fileId);
      if (token !== generation) return;
      if (!blob) throw Error("Missing audio file");
      objectURL = URL.createObjectURL(blob);
      src = objectURL;
    }
    if (token !== generation) return;
    audio.src = src;
    await audio.play();
  } catch {
    if (token !== generation) return;
    failed();
    throw Error(error);
  }
  if (token === generation) { loading = false; notify(); }
}
export async function advanceAudio(direction = 1, ended = false) {
  const next = nextQueueIndex(queueIndex, queue.length, repeat, direction, ended);
  if (next < 0) { notify(); return; }
  await loadAudioTrack(next);
}
export function audioEmbed(url) {
  try {
    const u = new URL(url);
    if (
      u.hostname === "open.spotify.com" &&
      /^\/(track|album|playlist|episode)\/[a-zA-Z0-9]+$/.test(u.pathname)
    )
      return `https://open.spotify.com/embed${u.pathname}`;
  } catch {}
  return "";
}
export function videoMarkup(url) {
  const info = videoSource(url);
  if (!info)
    return `<div class="empty-inline">This source does not offer a supported inline player. You can still open the original.</div>`;
  if (info.provider === "direct")
    return `<video controls autoplay playsinline src="${esc(url)}"></video>`;
  return `<iframe src="${esc(info.embed)}" title="Video player" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}
export function makeAmbientWav() {
  const rate = 22050,
    seconds = 16,
    frames = rate * seconds,
    buffer = new ArrayBuffer(44 + frames * 2),
    view = new DataView(buffer);
  const text = (p, s) =>
    [...s].forEach((c, i) => view.setUint8(p + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const fade = Math.min(t / 2, (seconds - t) / 3, 1);
    let sample = 0;
    for (const f of [130.81, 196, 261.63, 329.63])
      sample +=
        Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.2) * 0.2) *
        0.07 *
        (0.75 + 0.25 * Math.sin(t * 0.4 + f));
    view.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, sample * fade)) * 32767,
      true,
    );
  }
  return buffer;
}
