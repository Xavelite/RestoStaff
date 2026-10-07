// Starter content is deliberately separate from the dashboard and storage code.
export const CATALOG_VERSION = 9;
export const catalogCollections = [
  ["daily", "Everyday essentials", "Your day, within reach.", "sage", "sun"],
  [
    "search",
    "Search & discover",
    "Find an answer. Follow a new direction.",
    "blue",
    "search",
  ],
  [
    "music",
    "Music & listening",
    "Live sessions, favorite sounds, and a queue you can loop.",
    "violet",
    "music",
  ],
  [
    "rock",
    "80s–90s rock",
    "Big guitars. Timeless choruses. Press play and let it run.",
    "amber",
    "music",
  ],
  [
    "social",
    "Social & communities",
    "People, conversations, and shared interests.",
    "rose",
    "users",
  ],
  [
    "news",
    "News & perspectives",
    "A mix of international and Belgian newsrooms.",
    "neutral",
    "news",
  ],
  [
    "finance",
    "Money & markets",
    "Market research, financial learning, and everyday money tools.",
    "blue",
    "chart",
  ],
  [
    "slow",
    "Streaming & watching",
    "Films, series, live streams, and what to watch next.",
    "rose",
    "video",
  ],
  [
    "create",
    "Create & organize",
    "A place for ideas, projects, and inspiration.",
    "violet",
    "spark",
  ],
  [
    "learn",
    "Learn & explore",
    "Small questions. Bigger possibilities.",
    "amber",
    "book",
  ],
  ["travel", "Travel & places", "Find your way, near or far.", "sage", "globe"],
  [
    "holidays",
    "Holiday pictures",
    "A little escape · sample photos for your next adventure.",
    "blue",
    "image",
  ],
  [
    "tools",
    "Useful tools",
    "The practical things you are always looking for.",
    "neutral",
    "settings",
  ],
].map(([id, name, description, color, icon]) => ({
  id,
  name,
  description,
  color,
  icon,
  collapsed: false,
}));

const links = {
  daily: [
    [
      "chatgpt",
      "ChatGPT",
      "A place to think things through",
      "https://chatgpt.com",
      "sage",
    ],
    [
      "gmail",
      "Gmail",
      "Your inbox, one click away",
      "https://mail.google.com",
      "rose",
    ],
    [
      "calendar",
      "Google Calendar",
      "Make room for what is next",
      "https://calendar.google.com",
      "blue",
    ],
    [
      "drive",
      "Google Drive",
      "Documents and files in the cloud",
      "https://drive.google.com",
      "amber",
    ],
  ],
  search: [
    [
      "google",
      "Google",
      "A starting point for almost anything",
      "https://www.google.com",
      "blue",
    ],
    [
      "bing",
      "Bing",
      "Search the web, images, and more",
      "https://www.bing.com",
      "sage",
    ],
    [
      "duckduckgo",
      "DuckDuckGo",
      "An alternative way to search",
      "https://duckduckgo.com",
      "amber",
    ],
    [
      "brave",
      "Brave Search",
      "Explore another search index",
      "https://search.brave.com",
      "rose",
    ],
    [
      "kagi",
      "Kagi",
      "A different take on web search",
      "https://kagi.com",
      "neutral",
    ],
    [
      "perplexity",
      "Perplexity",
      "Questions, answers, and sources",
      "https://www.perplexity.ai",
      "blue",
    ],
  ],
  music: [
    [
      "spotify",
      "Spotify",
      "Your library and new discoveries",
      "https://open.spotify.com",
      "sage",
    ],
    [
      "soundcloud",
      "SoundCloud",
      "Independent sounds and new artists",
      "https://soundcloud.com",
      "amber",
    ],
    [
      "bandcamp",
      "Bandcamp",
      "Explore artists and albums",
      "https://bandcamp.com",
      "blue",
    ],
    [
      "youtubemusic",
      "YouTube Music",
      "Albums, playlists, and music discoveries",
      "https://music.youtube.com",
      "rose",
    ],
    [
      "nts",
      "NTS Radio",
      "Radio shows and sounds from around the world",
      "https://www.nts.live",
      "neutral",
    ],
    [
      "tadow",
      "Lofi Girl",
      "Study beats and ambient radio on YouTube",
      "https://www.youtube.com/@LofiGirl",
      "violet",
    ],
  ],
  social: [
    [
      "instagram",
      "Instagram",
      "Photos, stories, and creative people",
      "https://www.instagram.com",
      "rose",
    ],
    [
      "reddit",
      "Reddit",
      "A community for every curiosity",
      "https://www.reddit.com",
      "amber",
    ],
    [
      "linkedin",
      "LinkedIn",
      "People, careers, and professional ideas",
      "https://www.linkedin.com",
      "blue",
    ],
    [
      "bluesky",
      "Bluesky",
      "Find your corner of the conversation",
      "https://bsky.app",
      "blue",
    ],
    [
      "x",
      "X",
      "Follow the conversation as it happens",
      "https://x.com",
      "neutral",
    ],
    [
      "discord",
      "Discord",
      "Your communities and group chats",
      "https://discord.com/app",
      "violet",
    ],
  ],
  news: [
    [
      "reuters",
      "Reuters",
      "International reporting",
      "https://www.reuters.com",
      "amber",
    ],
    [
      "ap",
      "AP News",
      "News from around the world",
      "https://apnews.com",
      "neutral",
    ],
    [
      "bbc",
      "BBC News",
      "World news and explainers",
      "https://www.bbc.com/news",
      "rose",
    ],
    [
      "guardian",
      "The Guardian",
      "Reporting, analysis, and culture",
      "https://www.theguardian.com",
      "blue",
    ],
    [
      "lesoir",
      "Le Soir",
      "Belgian news in French",
      "https://www.lesoir.be",
      "blue",
    ],
    [
      "rtbf",
      "RTBF Info",
      "Belgian and international coverage",
      "https://www.rtbf.be/info",
      "sage",
    ],
  ],
  finance: [
    [
      "tradingview",
      "TradingView",
      "Charts and market research",
      "https://www.tradingview.com",
      "blue",
    ],
    [
      "yahoofinance",
      "Yahoo Finance",
      "Markets, companies, and financial news",
      "https://finance.yahoo.com",
      "violet",
    ],
    [
      "investopedia",
      "Investopedia",
      "Understand financial terms and concepts",
      "https://www.investopedia.com",
      "sage",
    ],
    [
      "wise",
      "Wise",
      "Currencies and international money tools",
      "https://wise.com",
      "sage",
    ],
    [
      "revolut",
      "Revolut",
      "An everyday money hub",
      "https://www.revolut.com",
      "neutral",
    ],
    [
      "ecb",
      "European Central Bank",
      "Euro reference rates and economic data",
      "https://www.ecb.europa.eu",
      "blue",
    ],
  ],
  slow: [
    [
      "youtube",
      "YouTube",
      "A world of things to watch",
      "https://www.youtube.com",
      "rose",
    ],
    [
      "netflix",
      "Netflix",
      "Films and series for your evening",
      "https://www.netflix.com",
      "neutral",
    ],
    [
      "prime",
      "Prime Video",
      "Movies, series, and originals",
      "https://www.primevideo.com",
      "blue",
    ],
    [
      "disney",
      "Disney+",
      "Stories for a night in",
      "https://www.disneyplus.com",
      "blue",
    ],
    [
      "arte",
      "ARTE",
      "Documentaries, culture, and cinema",
      "https://www.arte.tv",
      "amber",
    ],
    [
      "twitch",
      "Twitch",
      "Live streams and communities",
      "https://www.twitch.tv",
      "violet",
    ],
    [
      "justwatch",
      "JustWatch Belgium",
      "Find where a film or series is streaming",
      "https://www.justwatch.com/be",
      "amber",
    ],
  ],
  create: [
    [
      "notion",
      "Notion",
      "Notes, plans, and shared ideas",
      "https://www.notion.so",
      "neutral",
    ],
    [
      "figma",
      "Figma",
      "From a thought to a first draft",
      "https://www.figma.com",
      "violet",
    ],
    [
      "arena",
      "Are.na",
      "Connect ideas and follow your curiosity",
      "https://www.are.na",
      "amber",
    ],
    [
      "github",
      "GitHub",
      "A home for what you build",
      "https://github.com",
      "blue",
    ],
    [
      "pinterest",
      "Pinterest",
      "Keep a little inspiration close",
      "https://www.pinterest.com",
      "rose",
    ],
    [
      "canva",
      "Canva",
      "Bring a visual idea to life",
      "https://www.canva.com",
      "blue",
    ],
  ],
  learn: [
    [
      "wikipedia",
      "Wikipedia",
      "Start with a question. Keep exploring.",
      "https://www.wikipedia.org",
      "neutral",
    ],
    [
      "khan",
      "Khan Academy",
      "Build understanding, step by step",
      "https://www.khanacademy.org",
      "sage",
    ],
    [
      "coursera",
      "Coursera",
      "Courses and new areas to explore",
      "https://www.coursera.org",
      "blue",
    ],
    [
      "ted",
      "TED",
      "Ideas and talks worth considering",
      "https://www.ted.com",
      "rose",
    ],
    [
      "mdn",
      "MDN Web Docs",
      "A reference for building on the web",
      "https://developer.mozilla.org",
      "neutral",
    ],
    [
      "freecodecamp",
      "freeCodeCamp",
      "Practice coding by building things",
      "https://www.freecodecamp.org",
      "sage",
    ],
  ],
  travel: [
    [
      "maps",
      "Google Maps",
      "Places, directions, and saved spots",
      "https://maps.google.com",
      "sage",
    ],
    [
      "rome2rio",
      "Rome2Rio",
      "Explore ways to get from A to B",
      "https://www.rome2rio.com",
      "rose",
    ],
    [
      "sncb",
      "SNCB / NMBS",
      "Trains and journeys in Belgium",
      "https://www.belgiantrain.be",
      "blue",
    ],
    [
      "skyscanner",
      "Skyscanner",
      "Explore flights and destinations",
      "https://www.skyscanner.net",
      "blue",
    ],
  ],
  tools: [
    [
      "deepl",
      "DeepL",
      "Find the words in another language",
      "https://www.deepl.com/translator",
      "blue",
    ],
    [
      "wolfram",
      "WolframAlpha",
      "Calculations and structured answers",
      "https://www.wolframalpha.com",
      "amber",
    ],
    [
      "archive",
      "Internet Archive",
      "Explore the web and its history",
      "https://archive.org",
      "neutral",
    ],
    [
      "speedtest",
      "Speedtest",
      "Check your internet connection",
      "https://www.speedtest.net",
      "violet",
    ],
  ],
};

export function catalogCards() {
  const cards = Object.entries(links).flatMap(([collectionId, rows]) =>
    rows.map(([id, title, description, url, color]) => ({
      id,
      collectionId,
      type: "link",
      title,
      description,
      url,
      color,
      favorite: ["chatgpt", "figma"].includes(id),
    })),
  );
  cards.push(
    ...[
      [
        "holiday-beach",
        "A little island time",
        "Seychelles · sample photo by Datingscout / Unsplash",
        "photo-1701782638049-83bf684beedf",
        "https://unsplash.com/photos/KxKzp4e7gak",
      ],
      [
        "holiday-lake",
        "Mornings by the lake",
        "Alpine escape · sample photo from Unsplash",
        "photo-1783544745401-d8a54fc9f0ca",
        "https://unsplash.com/photos/NobyX_K-H6E",
      ],
      [
        "holiday-venice",
        "Lost in Venice",
        "Venice · sample photo by Luca Hooijer / Unsplash",
        "photo-1758046110282-58c021d3e92a",
        "https://unsplash.com/photos/jgqxINx3R9g",
      ],
      [
        "holiday-canal",
        "The scenic route",
        "Venice · sample photo by Chris Turgeon / Unsplash",
        "photo-1671680448072-c15f8be4d3d8",
        "https://unsplash.com/photos/IFuDm6dUZGg",
      ],
    ].map(([id, title, description, photo, sourceURL]) => ({
      id,
      title,
      description,
      sourceURL,
      url: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1400&q=85`,
      fileName: `${id}.jpg`,
      mime: "image/jpeg",
      type: "file",
      collectionId: "holidays",
      color: "blue",
    })),
    ...[
      [
        "sample-weekend-plans",
        "Weekend plans",
        "Excel · a few plans, with time to spare",
        "Weekend plans.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "sage",
      ],
      [
        "sample-budget",
        "Weekend budget",
        "Excel · two sample sheets to explore",
        "Weekend budget.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "sage",
      ],
      [
        "sample-slides",
        "Our next adventure",
        "PowerPoint · a three-slide sample",
        "Our next adventure.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "amber",
      ],
      [
        "sample-packing",
        "A lighter suitcase",
        "Word · a sample packing list",
        "A lighter suitcase.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "blue",
      ],
    ].map(([id, title, description, fileName, mime, color]) => ({
      id,
      title,
      description,
      fileName,
      mime,
      color,
      fileId: id,
      type: "file",
      url: "",
      collectionId: "create",
    })),
    ...[
      [
        "rock-gnr",
        "Guns N’ Roses · Sweet Child O’ Mine",
        "1987 · Appetite for Destruction",
        "1w7OgIMMRc4",
      ],
      [
        "rock-bonjovi",
        "Bon Jovi · Livin’ on a Prayer",
        "1986 · Slippery When Wet",
        "lDK9QqIzhwk",
      ],
      [
        "rock-acdc",
        "AC/DC · Thunderstruck",
        "1990 · The Razors Edge",
        "v2AC41dglnM",
      ],
      [
        "rock-cranberries",
        "The Cranberries · Zombie",
        "1994 · No Need to Argue",
        "6Ejga4kJUts",
      ],
      ["rock-queen", "Queen · I Want to Break Free", "A little freedom. A very big chorus.", "f4Mc-NYPHaQ"],
      ["rock-nirvana", "Nirvana · Smells Like Teen Spirit", "Seattle guitars, turned all the way up.", "hTWKbfoikeg"],
      ["rock-europe", "Europe · The Final Countdown", "The synth intro that needs no introduction.", "9jK-NcRmVcw"],
      ["rock-survivor", "Survivor · Eye of the Tiger", "An extra dose of get-up-and-go.", "btPJPFnesV4"],
      ["rock-badname", "Bon Jovi · You Give Love a Bad Name", "Big hooks from New Jersey.", "KrZHPOeOxQQ"],
      ["rock-rem", "R.E.M. · Losing My Religion", "Mandolin, melancholy, and a timeless melody.", "xwtdhWltSIg"],
      ["rock-oasis", "Oasis · Wonderwall", "An acoustic singalong from the Britpop years.", "bx1Bh8ZvH84"],
      ["rock-metallica", "Metallica · Nothing Else Matters", "A quieter opening. A powerful finish.", "tAGnKpE4NCI"],
    ].map(([id, title, description, videoId]) => ({
      id,
      title,
      description,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      type: "video",
      collectionId: "rock",
      color: "amber",
    })),
    ...[
      ["weather", "Weather", "weather", "blue"],
      ["clock", "Local time", "clock", "sage"],
      ["note", "A thought for later", "note", "amber"],
      ["focus", "Make a little progress", "focus", "rose"],
    ].map(([id, title, widget, color]) => ({
      id,
      title,
      widget,
      color,
      type: "widget",
      collectionId: "daily",
      url: "",
      description: "",
      note:
        id === "note"
          ? "Make a space that feels like you.\n\nLess searching. More doing."
          : "",
    })),
    ...[
      [
        "fkj",
        "FKJ · Tiny Desk",
        "Layered keys, loops, and a home-studio session",
        "PwV1-wZzT1Y",
      ],
      [
        "music-tadow",
        "FKJ & Masego · Tadow",
        "Saxophone, soulful keys, and an effortless groove",
        "hC8CH0Z3L54",
      ],
      [
        "music-khruangbin",
        "Khruangbin · Tiny Desk",
        "Warm guitar tones and a laid-back live session",
        "vWLJeqLPfSU",
      ],
      [
        "music-anderson",
        "Anderson .Paak · Tiny Desk",
        "Drums, soul, and The Free Nationals live",
        "ferZnZ0_rSM",
      ],
    ].map(([id, title, description, videoId]) => ({
      id,
      title,
      description,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      type: "video",
      collectionId: "music",
      color: "violet",
    })),
    {
      id: "audio",
      type: "audio",
      collectionId: "music",
      title: "Slow orbit",
      description: "An original ambient sample · 16 seconds",
      url: "/universal/assets/slow-orbit.wav",
      color: "violet",
    },
    {
      id: "audio-morning-light", type: "audio", collectionId: "music",
      title: "Morning light", description: "Original piano sample · 18 seconds · saved audio file",
      fileId: "audio-morning-light", fileName: "Morning light.wav", mime: "audio/wav",
      url: "", color: "amber",
    },
    {
      id: "audio-blue-hour", type: "audio", collectionId: "music",
      title: "Blue hour", description: "Original mellow beat · 20 seconds · WAV link",
      url: "/universal/assets/blue-hour.wav", color: "blue",
    },
    {
      id: "audio-afterglow", type: "audio", collectionId: "music",
      title: "Afterglow", description: "Original synth arpeggio · 24 seconds · WAV link",
      url: "/universal/assets/afterglow.wav", color: "rose",
    },
    ...[1, 2].map((n) => ({
      id: `audio-soundhelix-${n}`, type: "audio", collectionId: "music",
      title: `SoundHelix · Song ${n}`,
      description: "T. Schürger / SoundHelix · full-length MP3 link",
      url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`,
      sourceURL: "https://www.soundhelix.com/audio-examples", color: n === 1 ? "sage" : "violet",
    })),
    {
      id: "video",
      type: "video",
      collectionId: "slow",
      title: "A little pause",
      description: "A moment in the garden · sample",
      url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      color: "sage",
    },
    {
      id: "guide",
      type: "file",
      collectionId: "create",
      title: "Your space, your rules",
      description: "A tiny guide to getting started",
      url: "",
      color: "sage",
      fileId: "welcome-file",
      fileName: "Welcome to Universal.txt",
      mime: "text/plain",
      fileSize: 700,
    },
  );
  const order = [
    "chatgpt",
    "gmail",
    "weather",
    "clock",
    "note",
    "focus",
    "calendar",
    "drive",
    "fkj",
    "music-tadow",
    "music-khruangbin",
    "music-anderson",
    "tadow",
    "spotify",
    "soundcloud",
    "bandcamp",
    "youtubemusic",
    "nts",
    "audio",
    "audio-morning-light",
    "audio-blue-hour",
    "audio-afterglow",
    "audio-soundhelix-1",
    "audio-soundhelix-2",
  ];
  return cards
    .map((c) => ({
      favorite: false,
      widget: "",
      note: "",
      city: "Brussels",
      latitude: 50.85,
      longitude: 4.35,
      timezone: "Europe/Brussels",
      minutes: 25,
      createdAt: Date.now(),
      ...c,
    }))
    .sort((a, b) => {
      if (a.collectionId !== b.collectionId)
        return (
          catalogCollections.findIndex((c) => c.id === a.collectionId) -
          catalogCollections.findIndex((c) => c.id === b.collectionId)
        );
      const ai = order.indexOf(a.id),
        bi = order.indexOf(b.id);
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
    });
}

// Expand the old mockup once. User-created cards, notes, names, and files survive.
export function expandCatalog(state) {
  if ((state.catalogVersion || 0) >= CATALOG_VERSION) return false;
  // This update only adds the requested music examples to existing dashboards.
  // Do not restore unrelated starter cards that someone has already removed.
  if (state.catalogVersion >= 6) {
    if (state.catalogVersion < 8 && !state.collections.some((c) => c.id === "music"))
      state.collections.push({ ...catalogCollections.find((c) => c.id === "music") });
    if (!state.collections.some((c) => c.id === "rock"))
      state.collections.push({ ...catalogCollections.find((c) => c.id === "rock"), visibility: "private" });
    for (const card of catalogCards().filter((c) =>
      (state.catalogVersion < 7 && c.id.startsWith("music-")) ||
      (state.catalogVersion < 8 && c.id.startsWith("audio-")) ||
      (c.id.startsWith("rock-") && !["rock-gnr", "rock-bonjovi", "rock-acdc", "rock-cranberries"].includes(c.id)))) {
      if (!state.cards.some((c) => c.id === card.id ||
        (card.url && c.collectionId === card.collectionId && c.url === card.url)))
        state.cards.push(card);
    }
    state.catalogVersion = CATALOG_VERSION;
    return true;
  }
  // These two temporary examples refused embedded playback during QA.
  state.cards = state.cards.filter(
    (c) =>
      !(
        c.id === "khruangbin" &&
        c.url === "https://www.youtube.com/watch?v=vWLJeqLPfSU"
      ) &&
      !(
        c.id === "anderson" &&
        c.url === "https://www.youtube.com/watch?v=ferZnZ0_rSM"
      ),
  );
  const unavailable = state.cards.find(
    (c) =>
      c.id === "tadow" &&
      [
        "https://www.youtube.com/watch?v=hC8CH0Z3L54",
        "https://www.youtube.com/watch?v=avjI3_GIZBw",
        "https://www.youtube.com/watch?v=pfU0QORkRpY",
      ].includes(c.url),
  );
  if (unavailable)
    Object.assign(unavailable, {
      type: "link",
      title: "Lofi Girl",
      description: "Study beats and ambient radio on YouTube",
      url: "https://www.youtube.com/@LofiGirl",
    });
  const oldIds = new Set([
    "chatgpt",
    "notion",
    "weather",
    "clock",
    "figma",
    "arena",
    "note",
    "focus",
    "github",
    "guide",
    "youtube",
    "video",
    "audio",
    "pinterest",
  ]);
  const exists = new Set(state.cards.map((c) => c.id));
  for (const collection of catalogCollections) {
    const current = state.collections.find((c) => c.id === collection.id);
    if (!current) state.collections.push({ ...collection });
    else if (current.id === "slow" && current.name === "A little downtime")
      Object.assign(current, {
        name: collection.name,
        description: collection.description,
        icon: collection.icon,
      });
  }
  const destination = {
    notion: ["daily", "create"],
    note: ["create", "daily"],
    focus: ["create", "daily"],
    audio: ["slow", "music"],
    pinterest: ["slow", "create"],
  };
  for (const [id, [from, to]] of Object.entries(destination)) {
    const c = state.cards.find((c) => c.id === id);
    if (c?.collectionId === from) c.collectionId = to;
  }
  for (const c of catalogCards())
    if (!exists.has(c.id) && !oldIds.has(c.id)) state.cards.push(c);
  const rank = new Map(catalogCollections.map((c, i) => [c.id, i]));
  state.collections.sort(
    (a, b) => (rank.get(a.id) ?? 100) - (rank.get(b.id) ?? 100),
  );
  state.catalogVersion = CATALOG_VERSION;
  return true;
}

