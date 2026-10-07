import { getState, replaceAll } from "./storage.js";
import { validateState } from "./model.js";
import { catalogCards, catalogCollections } from "./catalog.js";
export async function migrateLocalAddress() {
  if (location.hostname === "127.0.0.1") {
    location.replace(
      localStorage.getItem("universal-localhost-moved")
        ? `http://localhost:${location.port}/`
        : "/transfer.html",
    );
    return true;
  }
  if (
    location.hostname !== "localhost" ||
    !new URLSearchParams(location.search).has("migrate")
  )
    return false;
  const origin = `http://127.0.0.1:${location.port}`;
  if (!window.opener)
    throw Error("Open your original dashboard to transfer your saved space.");
  const transfer = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(
        Error(
          "The local transfer timed out. Your original space is still saved.",
        ),
      );
    }, 15000);
    const receive = (event) => {
      if (
        event.origin !== origin ||
        event.source !== window.opener ||
        event.data?.type !== "universal-transfer"
      )
        return;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      event.data.error ? reject(Error(event.data.error)) : resolve(event.data);
    };
    window.addEventListener("message", receive);
    window.opener.postMessage({ type: "universal-transfer-request" }, origin);
  });
  if (transfer.state) {
    const state = validateState(transfer.state),
      files = new Map(transfer.files),
      current = await getState();
    // Keep custom content already added on localhost as well as the original space.
    if (current) {
      const defaults = new Set(catalogCards().map((c) => c.id)),
        collections = new Set(state.collections.map((c) => c.id)),
        cards = new Set(state.cards.map((c) => c.id));
      for (const c of current.collections)
        if (
          !collections.has(c.id) &&
          !catalogCollections.some((d) => d.id === c.id)
        )
          state.collections.push(c);
      for (const c of current.cards)
        if (
          !cards.has(c.id) &&
          !defaults.has(c.id) &&
          state.collections.some((d) => d.id === c.collectionId)
        ) {
          state.cards.push(c);
          if (c.fileId) {
            const { getFile } = await import("./storage.js");
            files.set(c.fileId, await getFile(c.fileId));
          }
        }
    }
    for (const c of state.cards)
      if (c.fileId && !(files.get(c.fileId) instanceof Blob))
        throw Error(
          "An attachment could not be transferred. Your original space is unchanged.",
        );
    await replaceAll(validateState(state), files);
  }
  window.opener.postMessage({ type: "universal-transfer-complete" }, origin);
  history.replaceState(null, "", "/");
  return false;
}
