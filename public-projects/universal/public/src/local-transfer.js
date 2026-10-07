import { getState, getFile } from "./storage.js";
const origin = `http://localhost:${location.port}`;
const button = document.querySelector("#continue"),
  status = document.querySelector("#status");
let destination,
  completed = false,
  state,
  files = [];
try {
  state = await getState();
  if (state)
    for (const id of new Set(state.cards.map((c) => c.fileId).filter(Boolean)))
      files.push([id, await getFile(id)]);
  button.disabled = false;
  button.textContent = "Continue with my saved space";
} catch {
  status.textContent =
    "Your saved space could not be read. Reload to try again.";
}
button.addEventListener("click", () => {
  if (completed) {
    location.href = origin;
    return;
  }
  destination = window.open(`${origin}/?migrate=1`, "universal-localhost");
  if (!destination)
    status.textContent =
      "Allow the local preview window to open, then try again.";
});
window.addEventListener("message", (event) => {
  if (
    location.hostname !== "127.0.0.1" ||
    event.origin !== origin ||
    event.source !== destination
  )
    return;
  if (event.data?.type === "universal-transfer-request")
    destination.postMessage(
      { type: "universal-transfer", state, files },
      origin,
    );
  if (event.data?.type === "universal-transfer-complete") {
    completed = true;
    localStorage.setItem("universal-localhost-moved", "1");
    status.textContent =
      "Your saved space is now open at localhost. You can close this tab.";
    button.textContent = "Open Universal";
  }
});
