/** Presentation choices never change a card's identity, audience, or stored order. */
export const VIEWS = { adaptive: "Mixed grid", classic: "Uniform grid", compact: "Compact grid", list: "List" };
export const SIZES = { auto: "Automatic", compact: "Compact", standard: "Standard", wide: "Wide" };

export function cardKind(card) {
  if (card.type !== "file") return card.type;
  return /^(image\/)/i.test(card.mime || "") || /\.(avif|webp|jpe?g|png|gif)(\?|$)/i.test(card.fileName || card.url || "") ? "picture" : "document";
}

export function cardSize(card, collection = {}) {
  if (Object.hasOwn(SIZES, card.size) && card.size !== "auto") return card.size;
  if (card.contentKind === "book") return "standard";
  if (card.type === "video" || cardKind(card) === "picture") return "wide";
  if (card.type === "link") return /daily|essential/i.test(`${collection.id} ${collection.name}`) ? "standard" : "compact";
  return "standard";
}

export function cardUnits(card, collection = {}) {
  return card.size === "wide" ? 4 : cardSize(card, collection) === "compact" ? 1 : 2;
}

export function overviewCards(cards, collection = {}) {
  // A representative first row: up to two media previews, then useful shortcuts.
  // Respect the relative order of all selected cards and never alter stored data.
  const selected = [];
  let media = 0, widgets = 0, units = 0;
  const allMedia = cards.every((c) => ["video", "audio", "picture", "document"].includes(cardKind(c)));
  for (const card of cards) {
    const kind = cardKind(card);
    const rich = ["video", "audio", "picture", "document"].includes(kind);
    if (rich && media >= (allMedia ? 4 : 2)) continue;
    if (kind === "widget" && widgets >= 2 && cards.some(c => c.type !== "widget")) continue;
    const weight = cardUnits(card, collection);
    if (units + weight > 8 || selected.length >= 6) continue;
    selected.push(card);
    units += weight;
    if (rich) media++;
    if (kind === "widget") widgets++;
  }
  return selected;
}

export function upgradePresentation(space) {
  if (space.presentationVersion >= 1) return false;
  space.presentationVersion = 1;
  space.settings.view = "adaptive";
  space.settings.theme = "dark";
  return true;
}
