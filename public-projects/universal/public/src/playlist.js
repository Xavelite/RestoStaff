import { inCollection } from "./classification.js";
import { videoSource } from "./model.js";

export function collectionQueue(cards, collectionId) {
  return cards.filter(
    (c) =>
      inCollection(c, collectionId) &&
      c.type === "video" &&
      videoSource(c.url)?.provider === "youtube",
  );
}

export function audioCollectionQueue(cards, collectionId) {
  return cards.filter((c) => inCollection(c, collectionId) && c.type === "audio" &&
    (c.fileId || /\.(mp3|wav|ogg|m4a|aac|flac|opus)(?:[?#]|$)/i.test(c.url)));
}

export function nextQueueIndex(
  index,
  length,
  repeat = "all",
  direction = 1,
  ended = false,
) {
  if (!length) return -1;
  if (ended && repeat === "one") return index;
  const next = index + direction;
  if (next >= 0 && next < length) return next;
  return repeat === "all" ? (next + length) % length : -1;
}
