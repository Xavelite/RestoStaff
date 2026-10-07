import { icon } from "./icons.js";
import { escapeHTML as esc, videoSource } from "./model.js";
import { nextQueueIndex } from "./playlist.js";

let apiPromise,
  player,
  session = null,
  generation = 0;
let notify = () => {};
export function onYouTubeChange(fn) {
  notify = fn;
}
export function playingYouTubeId() {
  return session?.cards[session.index]?.id || null;
}

export function apiReady() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          Error(
            "YouTube could not load. Check your connection or open the original video.",
          ),
        ),
      15000,
    );
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(
        Error(
          "YouTube could not load. Open the original video or try again later.",
        ),
      );
    };
    document.head.append(script);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

function host() {
  return document.querySelector("#youtube-host");
}
function updateSizeButton() {
  const button = host().querySelector('[data-player-action="size"]');
  const label = session.minimized ? "Expand player" : "Minimize player";
  button.innerHTML = icon(session.minimized ? "expand" : "minimize");
  button.setAttribute("aria-label", label);
  button.title = label;
}
function toggleSize() {
  const dock = host().querySelector(".youtube-dock");
  const queue = dock.querySelector("details");
  if (!session.minimized) {
    session.restoreLayout = { style: dock.style.cssText, queueOpen: queue.open };
    queue.open = false;
    dock.style.cssText = "";
    dock.classList.add("is-minimized");
    session.minimized = true;
  } else {
    dock.classList.remove("is-minimized");
    dock.style.cssText = session.restoreLayout.style;
    queue.open = session.restoreLayout.queueOpen;
    // Keep a previously resized player reachable after a viewport change.
    const box = dock.getBoundingClientRect();
    if (box.right > innerWidth - 8 || box.bottom > innerHeight - 8 || box.left < 0 || box.top < 0) {
      Object.assign(dock.style, {
        left: "auto", top: "auto", right: "16px", bottom: "16px",
        width: `${Math.min(box.width, innerWidth - 32)}px`,
        height: `${Math.min(box.height, innerHeight - 32)}px`,
      });
    }
    session.minimized = false;
  }
  updateSizeButton();
}
function exitMinimumSize(dock) {
  if (!session.minimized) return;
  const box = dock.getBoundingClientRect();
  dock.classList.remove("is-minimized");
  Object.assign(dock.style, {
    width: `${box.width}px`, height: `${box.height}px`,
    left: `${box.left}px`, top: `${box.top}px`, right: "auto", bottom: "auto",
  });
  session.minimized = false;
  updateSizeButton();
}
function updateChrome() {
  if (!session) return;
  const card = session.cards[session.index];
  const el = host();
  el.querySelector(".queue-track").textContent = card.title;
  el.querySelector(".queue-context").textContent =
    `${session.title} · ${session.index + 1} of ${session.cards.length}`;
  const original = el.querySelector(".queue-original");
  original.href = card.url;
  const toggle = el.querySelector('[data-player-action="toggle"]');
  toggle.innerHTML = icon(session.playing ? "pause" : "play");
  toggle.setAttribute(
    "aria-label",
    session.playing ? "Pause YouTube" : "Play YouTube",
  );
  el.querySelector('[data-player-action="previous"]').disabled =
    !session.ready ||
    nextQueueIndex(session.index, session.cards.length, session.repeat, -1) < 0;
  el.querySelector('[data-player-action="next"]').disabled =
    !session.ready ||
    nextQueueIndex(session.index, session.cards.length, session.repeat, 1) < 0;
  toggle.disabled = !session.ready;
  el.querySelector('[name="repeat"]').value = session.repeat;
  el.querySelector(".queue-list").innerHTML = session.cards
    .map(
      (c, i) =>
        `<button class="queue-item ${i === session.index ? "current" : ""}" data-player-action="track" data-index="${i}" ${!session.ready ? "disabled" : ""} ${i === session.index ? 'aria-current="true"' : ""}><span>${i === session.index ? icon("music") : i + 1}</span><span>${esc(c.title)}</span></button>`,
    )
    .join("");
  notify();
}
function status(message) {
  const el = host()?.querySelector(".queue-status");
  if (el) {
    el.textContent = message;
    el.hidden = !message;
    if (!message) delete el.dataset.errorCode;
  }
}
function loadTrack(index) {
  if (!session?.ready || index < 0 || index >= session.cards.length) return;
  session.index = index;
  session.playing = false;
  status("");
  updateChrome();
  player.loadVideoById(videoSource(session.cards[index].url).id);
}
export function pauseYouTube() {
  player?.pauseVideo?.();
}
export function stopYouTube() {
  generation++;
  session = null;
  player?.destroy?.();
  player = null;
  if (host()) host().replaceChildren();
  document.body.classList.remove("youtube-active");
  notify();
}
export async function openYouTubeQueue(cards, title, index = 0) {
  if (!cards.length) return;
  stopYouTube();
  const token = generation;
  session = {
    cards: structuredClone(cards),
    title,
    index,
    repeat: "all",
    playing: false,
    ready: false,
    minimized: false,
    restoreLayout: null,
  };
  document.body.classList.add("youtube-active");
  host().innerHTML = `<section class="youtube-dock" aria-label="YouTube collection player"><header class="queue-header"><div><span class="queue-context"></span><strong class="queue-track"></strong></div><button class="icon-btn" data-player-action="close" aria-label="Close YouTube player">${icon("close")}</button></header><div class="queue-video"><div id="youtube-frame"></div></div><div class="queue-controls"><div><button class="icon-btn" data-player-action="previous" aria-label="Previous video">${icon("previous")}</button><button class="icon-btn queue-play" data-player-action="toggle" aria-label="Play YouTube">${icon("play")}</button><button class="icon-btn" data-player-action="next" aria-label="Next video">${icon("next")}</button></div><label class="repeat-control">${icon("repeat")}<select name="repeat" aria-label="Repeat playback"><option value="all">Repeat collection</option><option value="one">Repeat this video</option><option value="off">Repeat off</option></select></label></div><p class="queue-status" role="status">Loading YouTube…</p><div class="queue-footer"><details><summary>Up next · ${cards.length} videos</summary><div class="queue-list"></div></details><a class="queue-original" target="_blank" rel="noopener">Open on YouTube ${icon("arrow")}</a></div></section>`;
  updateChrome();
  host().querySelector('.queue-header [data-player-action="close"]').insertAdjacentHTML(
    "beforebegin",
    `<button class="icon-btn" data-player-action="size" aria-label="Minimize player" title="Minimize player">${icon("minimize")}</button>`,
  );
  host()
    .querySelector(".youtube-dock")
    .insertAdjacentHTML(
      "beforeend",
      ["nw", "ne", "sw", "se"]
        .map(
          (corner, i) =>
            `<button class="player-resize resize-${corner}" data-resize="${corner}" aria-label="Resize player from ${["top left", "top right", "bottom left", "bottom right"][i]}" title="Drag to resize · arrow keys also work"></button>`,
        )
        .join(""),
    );
  try {
    const YT = await apiReady();
    if (token !== generation || !session) return;
    player = new YT.Player("youtube-frame", {
      host: "https://www.youtube.com",
      width: "100%",
      height: "100%",
      videoId: videoSource(cards[index].url).id,
      playerVars: {
        autoplay: 1,
        playsinline: 1,
        origin: location.origin,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          if (token !== generation) return;
          session.ready = true;
          status("");
          updateChrome();
          event.target.playVideo();
        },
        onStateChange: (event) => {
          if (token !== generation || !session) return;
          session.playing = event.data === YT.PlayerState.PLAYING;
          if (session.playing) status("");
          if (event.data === YT.PlayerState.ENDED) {
            const next = nextQueueIndex(
              session.index,
              session.cards.length,
              session.repeat,
              1,
              true,
            );
            if (next >= 0) {
              loadTrack(next);
              return;
            }
            status("Collection finished. Play again whenever you like.");
          }
          updateChrome();
        },
        onError: (event) => {
          if (token !== generation || !session) return;
          host().querySelector(".queue-status").dataset.errorCode = String(
            event.data,
          );
          session.playing = false;
          status(
            [101, 150].includes(event.data)
              ? "YouTube does not allow this video to play here. Try Next, or open it on YouTube."
              : event.data === 153
                ? "YouTube could not verify this browser. Open the video on YouTube."
                : "This video is unavailable here. Try Next, or open it on YouTube.",
          );
          host().querySelector(".queue-status").dataset.errorCode = String(
            event.data,
          );
          updateChrome();
        },
        onAutoplayBlocked: () => {
          if (token !== generation) return;
          status("Press Play in the video to start listening.");
        },
      },
    });
  } catch (error) {
    if (token === generation) status(error.message);
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-player-action]");
  if (!button || !session) return;
  const action = button.dataset.playerAction;
  if (action === "close") {
    stopYouTube();
    return;
  }
  if (action === "size") {
    toggleSize();
    return;
  }
  if (!session.ready) return;
  if (action === "toggle") {
    if (session.playing) player.pauseVideo();
    else player.playVideo();
  }
  if (action === "track") loadTrack(Number(button.dataset.index));
  if (action === "next" || action === "previous")
    loadTrack(
      nextQueueIndex(
        session.index,
        session.cards.length,
        session.repeat,
        action === "next" ? 1 : -1,
      ),
    );
});
document.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-resize]");
  if (!handle || !session || event.button !== 0) return;
  const dock = handle.closest(".youtube-dock");
  if (document.fullscreenElement) return;
  exitMinimumSize(dock);
  const box = dock.getBoundingClientRect(),
    startX = event.clientX,
    startY = event.clientY;
  const corner = handle.dataset.resize;
  handle.setPointerCapture(event.pointerId);
  event.preventDefault();
  dock.classList.add("is-resizing");
  const move = (e) => {
    const dx = e.clientX - startX,
      dy = e.clientY - startY;
    const left = corner.includes("w")
      ? Math.max(8, Math.min(box.right - 280, box.left + dx))
      : box.left;
    const top = corner.includes("n")
      ? Math.max(8, Math.min(box.bottom - 360, box.top + dy))
      : box.top;
    const right = corner.includes("e")
      ? Math.min(innerWidth - 8, Math.max(left + 280, box.right + dx))
      : box.right;
    const bottom = corner.includes("s")
      ? Math.min(innerHeight - 8, Math.max(top + 360, box.bottom + dy))
      : box.bottom;
    Object.assign(dock.style, {
      left: `${left}px`,
      top: `${top}px`,
      right: "auto",
      bottom: "auto",
      width: `${right - left}px`,
      height: `${bottom - top}px`,
    });
  };
  const end = () => {
    dock.classList.remove("is-resizing");
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
});
document.addEventListener("keydown", (event) => {
  const handle = event.target.closest?.("[data-resize]");
  if (
    !handle ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  const dock = handle.closest(".youtube-dock");
  exitMinimumSize(dock);
  const box = dock.getBoundingClientRect();
  const width = Math.max(
    280,
    Math.min(
      innerWidth - 32,
      box.width +
        (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0),
    ),
  );
  const height = Math.max(
    360,
    Math.min(
      innerHeight - 32,
      box.height +
        (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0),
    ),
  );
  Object.assign(dock.style, {
    width: `${width}px`,
    height: `${height}px`,
    left: "auto",
    top: "auto",
    right: "16px",
    bottom: "16px",
  });
});
document.addEventListener("change", (event) => {
  if (session && event.target.matches('#youtube-host [name="repeat"]')) {
    session.repeat = event.target.value;
    updateChrome();
  }
});
