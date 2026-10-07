// Hand-curated source links, not uploaded media or claims of free access.
// id | title | official/source URL | description | subject IDs | kind | creator
const rows = `
stardew|Stardew Valley|https://www.stardewvalley.net/|A country-life game about farming, friendships, and finding your own pace.|gaming.indie,gaming.together|game|ConcernedApe
celeste|Celeste|https://www.celestegame.com/|A mountain-climbing platformer about persistence, with precise movement.|gaming.indie|game|Maddy Makes Games
hollow-knight|Hollow Knight|https://www.hollowknight.com/|Explore an underground kingdom in a hand-drawn action adventure.|gaming.indie|game|Team Cherry
hades|Hades|https://www.supergiantgames.com/games/hades/|An action roguelike set in the Greek underworld.|gaming.indie|game|Supergiant Games
outer-wilds|Outer Wilds|https://www.mobiusdigitalgames.com/outer-wilds.html|A solar-system mystery built around exploration and curiosity.|gaming.indie,science.space|game|Mobius Digital
factorio|Factorio|https://www.factorio.com/|Design production lines and solve increasingly elaborate factory puzzles.|gaming.strategy,gaming.together|game|Wube Software
openttd|OpenTTD|https://www.openttd.org/|Build a transport network of trains, roads, ports, and airports.|gaming.strategy,gaming.together|game|OpenTTD contributors
wesnoth|The Battle for Wesnoth|https://www.wesnoth.org/|Turn-based fantasy strategy with campaigns and multiplayer battles.|gaming.strategy|game|Wesnoth contributors
zero-ad|0 A.D.|https://play0ad.com/|Historical real-time strategy from an open-source community.|gaming.strategy|game|Wildfire Games
mindustry|Mindustry|https://mindustrygame.github.io/|Connect factories and defenses in a resource-management strategy game.|gaming.strategy,gaming.together|game|Anuken
luanti|Luanti|https://www.luanti.org/|A platform for community-built voxel games and worlds.|gaming.making,gaming.together|tool|Luanti contributors
minecraft|Minecraft|https://www.minecraft.net/|Build, explore, and share block-built worlds.|gaming.together|game|Mojang Studios
terraria|Terraria|https://terraria.org/|A digging, building, and exploration adventure for solo or shared play.|gaming.together,gaming.indie|game|Re-Logic
deep-rock|Deep Rock Galactic|https://www.deeprockgalactic.com/|Cooperative cave exploration with a team of space dwarves.|gaming.together|game|Ghost Ship Games
portal-two|Portal 2|https://store.steampowered.com/app/620/Portal_2/|Portal puzzles with a separate cooperative campaign.|gaming.together|game|Valve
itch-jams|itch.io game jams|https://itch.io/jams|Discover small game-making challenges and the games made for them.|gaming.making,gaming.indie|community|itch.io
godot|Godot Engine|https://godotengine.org/|Build 2D and 3D games with an open-source game engine.|gaming.making,technology.open|tool|Godot contributors
gdevelop|GDevelop|https://gdevelop.io/|Create games using visual events and reusable behaviors.|gaming.making|tool|GDevelop
twine|Twine|https://twinery.org/|Write interactive stories with linked passages and choices.|gaming.making,reading.writing|tool|Twine contributors
kenney|Kenney game assets|https://kenney.nl/assets|Find building blocks for game prototypes, from interfaces to characters.|gaming.making,creativity.design|library|Kenney
pride|Pride and Prejudice|https://www.gutenberg.org/ebooks/1342|Elizabeth Bennet, first impressions, and the trouble with assumptions. Read online or choose an ebook format.|reading.classics|book|Jane Austen
alice|Alice’s Adventures in Wonderland|https://www.gutenberg.org/ebooks/11|A curious journey through a world that refuses to follow ordinary rules.|reading.classics,reading.speculative|book|Lewis Carroll
jane-eyre|Jane Eyre|https://www.gutenberg.org/ebooks/1260|A young woman’s search for independence, belonging, and love.|reading.classics|book|Charlotte Brontë
little-women|Little Women|https://www.gutenberg.org/ebooks/514|The March sisters navigate growing up, creativity, and family life.|reading.classics|book|Louisa May Alcott
moby-dick|Moby Dick|https://www.gutenberg.org/ebooks/2701|A sea voyage, a white whale, and an all-consuming pursuit.|reading.classics|book|Herman Melville
treasure|Treasure Island|https://www.gutenberg.org/ebooks/120|A map, a voyage, and an adventure full of uncertain loyalties.|reading.classics|book|Robert Louis Stevenson
frankenstein|Frankenstein|https://www.gutenberg.org/ebooks/84|Creation, responsibility, and loneliness in a landmark speculative novel.|reading.speculative,reading.mystery|book|Mary Shelley
time-machine|The Time Machine|https://www.gutenberg.org/ebooks/35|A journey into the distant future, with questions about the present.|reading.speculative|book|H. G. Wells
war-worlds|The War of the Worlds|https://www.gutenberg.org/ebooks/36|A Martian invasion seen through the eyes of an ordinary observer.|reading.speculative|book|H. G. Wells
sherlock|The Adventures of Sherlock Holmes|https://www.gutenberg.org/ebooks/1661|Short detective stories for an evening of clues and deductions.|reading.mystery|book|Arthur Conan Doyle
dracula|Dracula|https://www.gutenberg.org/ebooks/345|Letters and diaries unfold a gothic story across borders.|reading.mystery|book|Bram Stoker
dorian|The Picture of Dorian Gray|https://www.gutenberg.org/ebooks/174|A portrait, a bargain, and the consequences of a hidden life.|reading.mystery,reading.classics|book|Oscar Wilde
gutenberg|Project Gutenberg|https://www.gutenberg.org/|Explore ebook editions of older literature. Availability follows the source’s rights guidance.|reading.libraries|library|Project Gutenberg
standard-ebooks|Standard Ebooks|https://standardebooks.org/|Carefully formatted editions of public-domain texts; check the source’s regional rights guidance.|reading.libraries|library|Standard Ebooks
librivox|LibriVox|https://librivox.org/|Volunteer-read audiobooks, with listening and download options at the source.|reading.libraries|library|LibriVox
open-library|Open Library|https://openlibrary.org/|Explore book records, reading lists, and available borrowing options.|reading.libraries|library|Internet Archive
calibre|calibre|https://calibre-ebook.com/|Organize a personal ebook library and work with reading formats.|reading.libraries,tools.files|tool|Kovid Goyal and contributors
reedsy|Reedsy learning|https://reedsy.com/learning|Explore writing and publishing lessons for a book project.|reading.writing|course|Reedsy
hemingway|Hemingway Editor|https://hemingwayapp.com/|Review sentence clarity and readability while editing a draft.|reading.writing,tools.language|tool|Hemingway
radio-garden|Radio Garden|https://radio.garden/|Explore radio stations through a globe of places and sounds.|music.listen,travel.explore|website|Radio Garden
bandcamp|Bandcamp|https://bandcamp.com/|Discover music through artists, labels, and listeners’ collections.|music.listen|website|Bandcamp
nts|NTS Radio|https://www.nts.live/|Explore radio shows and listening sessions across scenes and genres.|music.listen|website|NTS
musicbrainz|MusicBrainz|https://musicbrainz.org/|Look up artists, releases, and relationships in a community music database.|music.listen,music.rock|library|MetaBrainz
discogs|Discogs|https://www.discogs.com/|Explore recorded releases and organize a record collection.|music.listen,play.collect|library|Discogs
audacity|Audacity|https://www.audacityteam.org/|Record and edit audio for a song, interview, or sound experiment.|music.making,technology.open|tool|Audacity
lmms|LMMS|https://lmms.io/|Compose patterns, melodies, and arrangements on your computer.|music.making|tool|LMMS contributors
bandlab|BandLab|https://www.bandlab.com/|Make and share music projects in an online music workspace.|music.making|tool|BandLab
ableton-learning|Learning Music|https://learningmusic.ableton.com/|Experiment with beats, melodies, and song structure in your browser.|music.learning|course|Ableton
musictheory|musictheory.net|https://www.musictheory.net/|Practice notation, intervals, and music theory with lessons and exercises.|music.learning|course|musictheory.net
justinguitar|JustinGuitar|https://www.justinguitar.com/|Follow guitar lessons and build a regular practice habit.|music.learning,music.rock|course|Justin Sandercoe
arte|ARTE|https://www.arte.tv/|Browse cultural programs, documentaries, and films; availability varies by location.|film.documentary,film.watch|publication|ARTE
nfb|National Film Board of Canada|https://www.nfb.ca/|Explore films, animation, and documentary storytelling.|film.documentary,film.shorts|library|NFB
short-week|Short of the Week|https://www.shortoftheweek.com/|Discover short films and the people behind them.|film.shorts|publication|Short of the Week
blender-films|Blender Studio films|https://studio.blender.org/films/|Explore animated productions and their creative process.|film.shorts,creativity.art|library|Blender Studio
bfi|BFI|https://www.bfi.org.uk/|Explore film culture, criticism, and cinema history.|film.watch,play.history|publication|British Film Institute
letterboxd|Letterboxd|https://letterboxd.com/|Keep a film diary and discover lists from other viewers.|film.watch,social.groups|community|Letterboxd
shotcut|Shotcut|https://shotcut.org/|Edit video with a desktop, open-source editor.|film.making,technology.open|tool|Shotcut
kdenlive|Kdenlive|https://kdenlive.org/|Assemble footage, audio, and effects on a video-editing timeline.|film.making|tool|KDE
obs|OBS Studio|https://obsproject.com/|Record your screen or build a live production from several sources.|film.making,gaming.making|tool|OBS contributors
mit-ocw|MIT OpenCourseWare|https://ocw.mit.edu/|Explore course materials from engineering, science, humanities, and more.|learning.courses|library|MIT
openlearn|OpenLearn|https://www.open.edu/openlearn/|Explore short courses and learning materials across subjects.|learning.courses|course|The Open University
khan|Khan Academy|https://www.khanacademy.org/|Work through explanations and exercises at your own pace.|learning.math,learning.courses|course|Khan Academy
cs50|CS50|https://cs50.harvard.edu/x/|An introduction to computer science through problems and projects.|learning.math,technology.code|course|Harvard University
mathigon|Mathigon|https://mathigon.org/|Explore mathematics through interactive lessons and manipulatives.|learning.math|course|Mathigon
desmos|Desmos|https://www.desmos.com/calculator|Plot functions and experiment with a graphing calculator.|learning.math,tools.everyday|tool|Desmos
duolingo|Duolingo|https://www.duolingo.com/|Practice languages through short, repeatable lessons.|learning.languages|course|Duolingo
tv5|TV5MONDE · Learn French|https://apprendre.tv5monde.com/|Practice French with exercises built around video and everyday topics.|learning.languages|course|TV5MONDE
dw-learn|DW · Learn German|https://learngerman.dw.com/|Explore German lessons and practice materials.|learning.languages|course|Deutsche Welle
zotero|Zotero|https://www.zotero.org/|Collect sources and organize references for research or writing.|learning.reference,work.notes|tool|Corporation for Digital Scholarship
doaj|Directory of Open Access Journals|https://doaj.org/|Find scholarly journals and articles through an open-access directory.|learning.reference|library|DOAJ
nasa|NASA Science|https://science.nasa.gov/|Explore missions and explanations about Earth, space, and the solar system.|science.space|publication|NASA
esa|European Space Agency|https://www.esa.int/|Explore European space missions, imagery, and science stories.|science.space|publication|ESA
stellarium|Stellarium Web|https://stellarium-web.org/|Explore an interactive sky map and look for constellations.|science.space|tool|Stellarium
inaturalist|iNaturalist|https://www.inaturalist.org/|Record wildlife observations and learn from a nature community.|science.nature,science.participate|community|iNaturalist
ebird|eBird|https://ebird.org/|Keep bird observations and explore sightings submitted by birders.|science.nature,science.participate|community|Cornell Lab of Ornithology
gbif|GBIF|https://www.gbif.org/|Explore biodiversity records contributed by institutions and communities.|science.nature|library|GBIF
copernicus|Copernicus Climate Change Service|https://climate.copernicus.eu/|Explore climate datasets, reports, and indicators.|science.earth|publication|Copernicus
usgs|USGS|https://www.usgs.gov/|Find science about landscapes, water, ecosystems, and natural hazards.|science.earth|publication|USGS
zooniverse|Zooniverse|https://www.zooniverse.org/|Contribute observations and classifications to people-powered research.|science.participate|community|Zooniverse
foldit|Foldit|https://fold.it/|Explore protein-folding puzzles in a scientific research game.|science.participate,gaming.strategy|game|Foldit
figma|Figma|https://www.figma.com/|Design interfaces and explore ideas with collaborators.|creativity.design,work.collaborate|tool|Figma
penpot|Penpot|https://penpot.app/|An open-source workspace for interface design and prototyping.|creativity.design,technology.open|tool|Penpot
google-fonts|Google Fonts|https://fonts.google.com/|Explore typefaces and compare how they feel in a design.|creativity.design|library|Google
coolors|Coolors|https://coolors.co/|Explore and organize color palettes for a visual project.|creativity.design|tool|Coolors
blender|Blender|https://www.blender.org/|Model, animate, and render 3D scenes with a creative toolset.|creativity.art,film.making|tool|Blender Foundation
krita|Krita|https://krita.org/|Draw and paint with a digital painting application.|creativity.art|tool|Krita Foundation
inkscape|Inkscape|https://inkscape.org/|Create vector illustrations, diagrams, and graphic designs.|creativity.design,creativity.art|tool|Inkscape contributors
darktable|darktable|https://www.darktable.org/|Organize and develop photographs in a RAW photo workflow.|creativity.photo|tool|darktable contributors
rawtherapee|RawTherapee|https://rawtherapee.com/|Develop RAW photographs with detailed image controls.|creativity.photo|tool|RawTherapee contributors
unsplash|Unsplash|https://unsplash.com/|Explore photography for inspiration and projects; check each image’s licensing.|creativity.photo|library|Unsplash
smithsonian|Smithsonian Open Access|https://www.si.edu/OpenAccess|Explore digitized objects and images from Smithsonian collections.|creativity.culture,play.history|library|Smithsonian Institution
europeana|Europeana|https://www.europeana.eu/en|Discover art, books, films, and music from cultural institutions.|creativity.culture,reading.libraries|library|Europeana
rijksmuseum|Rijksmuseum collection|https://www.rijksmuseum.nl/en/collection|Explore art and objects from the museum’s collection.|creativity.culture|library|Rijksmuseum
mdn|MDN Web Docs|https://developer.mozilla.org/|Reference and guides for HTML, CSS, JavaScript, and the web platform.|technology.code|guide|MDN contributors
freecodecamp|freeCodeCamp|https://www.freecodecamp.org/|Learn programming through exercises and projects.|technology.code,learning.courses|course|freeCodeCamp
odin|The Odin Project|https://www.theodinproject.com/|Follow a project-based path through web development.|technology.code,learning.courses|course|The Odin Project
github|GitHub|https://github.com/|Explore source code, collaborate on projects, and follow development.|technology.code,technology.open|community|GitHub
huggingface|Hugging Face|https://huggingface.co/|Explore machine-learning models, datasets, and community demos.|technology.ai|community|Hugging Face
fastai|fast.ai|https://www.fast.ai/|Explore practical learning resources about deep learning.|technology.ai,learning.courses|course|fast.ai
elements-ai|Elements of AI|https://www.elementsofai.com/|An introduction to artificial intelligence and its possibilities and limits.|technology.ai,learning.courses|course|University of Helsinki and MinnaLearn
linux-mint|Linux Mint|https://linuxmint.com/|Explore a desktop operating system and its community resources.|technology.open|tool|Linux Mint
privacy-guides|Privacy Guides|https://www.privacyguides.org/|Read explanations about privacy practices and tools.|technology.privacy|guide|Privacy Guides
eff|EFF Surveillance Self-Defense|https://ssd.eff.org/|Learn practical concepts for protecting digital communications.|technology.privacy|guide|Electronic Frontier Foundation
bitwarden|Bitwarden|https://bitwarden.com/|Organize login credentials with a password manager.|technology.privacy,tools.everyday|tool|Bitwarden
obsidian|Obsidian|https://obsidian.md/|Link personal notes into a knowledge library.|work.notes,reading.writing|tool|Obsidian
joplin|Joplin|https://joplinapp.org/|Collect notes, documents, and to-do lists.|work.notes|tool|Joplin
notion|Notion|https://www.notion.so/|Organize notes, projects, and shared workspaces.|work.notes,work.collaborate|tool|Notion
todoist|Todoist|https://todoist.com/|Break plans into tasks and organize what comes next.|work.planning|tool|Doist
trello|Trello|https://trello.com/|Arrange tasks and ideas on visual boards.|work.planning|tool|Atlassian
excalidraw|Excalidraw|https://excalidraw.com/|Sketch a diagram or work through an idea with a simple whiteboard.|work.collaborate,creativity.design|tool|Excalidraw
cryptpad|CryptPad|https://cryptpad.org/|Explore collaborative documents with privacy-focused tools.|work.collaborate,technology.privacy|tool|CryptPad
europass|Europass|https://europass.europa.eu/|Organize skills, qualifications, and a professional profile.|work.career|tool|European Union
behance|Behance|https://www.behance.net/|Explore creative portfolios and present visual work.|work.career,creativity.design|community|Adobe
reuters|Reuters|https://www.reuters.com/|Read international reporting across business, politics, and the world.|news.world|publication|Reuters
ap|AP News|https://apnews.com/|Explore reporting from the Associated Press.|news.world|publication|Associated Press
bbc|BBC News|https://www.bbc.com/news|Explore world news and reporting by topic.|news.world|publication|BBC
rtbf|RTBF|https://www.rtbf.be/|French-language Belgian news, culture, radio, and programs.|news.local|publication|RTBF
vrt|VRT NWS|https://www.vrt.be/vrtnws/en/|English-language reporting from the Belgian public broadcaster.|news.local|publication|VRT
euronews|Euronews|https://www.euronews.com/|Follow European and international reporting.|news.local,news.world|publication|Euronews
ourworld|Our World in Data|https://ourworldindata.org/|Explore data and explanations about large global questions.|news.explain,science.earth|publication|Global Change Data Lab
fullfact|Full Fact|https://fullfact.org/|Read fact checks and explanations about claims in public debate.|news.explain|publication|Full Fact
european-parliament|European Parliament|https://www.europarl.europa.eu/portal/en|Explore the institution, its work, and public information.|news.civic|website|European Parliament
wikifin|Wikifin|https://www.wikifin.be/|Belgian financial education and tools for everyday money questions.|money.literacy|guide|FSMA
investor-gov|Investor.gov|https://www.investor.gov/|US investor education with explanations of financial concepts and risks.|money.literacy|guide|US Securities and Exchange Commission
gnucash|GnuCash|https://www.gnucash.org/|Explore desktop bookkeeping for personal and small-business finances.|money.budget|tool|GnuCash contributors
actual|Actual Budget|https://actualbudget.org/|Explore a budgeting application for organizing income and spending.|money.budget|tool|Actual contributors
eurostat|Eurostat|https://ec.europa.eu/eurostat|Explore official European statistics and datasets.|money.data,news.explain|library|European Commission
worldbank|World Bank Open Data|https://data.worldbank.org/|Explore development and economic indicators across countries.|money.data|library|World Bank
fred|FRED|https://fred.stlouisfed.org/|Explore economic time series and build comparisons.|money.data|library|Federal Reserve Bank of St. Louis
start-business|Your Europe · Business|https://europa.eu/youreurope/business/|Find European public information for starting and running a business.|money.business|guide|European Union
startup-school|Startup School|https://www.startupschool.org/|Explore lessons and material about building a startup.|money.business|course|Y Combinator
openstreetmap|OpenStreetMap|https://www.openstreetmap.org/|Explore and contribute to a map built by a worldwide community.|travel.maps|tool|OpenStreetMap contributors
organic-maps|Organic Maps|https://organicmaps.app/|Explore an offline map and navigation application.|travel.maps,outdoors.walk|tool|Organic Maps
sncb|SNCB / NMBS|https://www.belgiantrain.be/|Plan rail journeys in Belgium and check travel information.|travel.rail|tool|SNCB / NMBS
seat61|The Man in Seat 61|https://www.seat61.com/|Explore practical route guides for journeys by train.|travel.rail|guide|Mark Smith
interrail|Interrail|https://www.interrail.eu/|Explore rail routes, passes, and planning information for Europe.|travel.rail,travel.plan|website|Interrail
visit-brussels|visit.brussels|https://www.visit.brussels/en/visitors|Explore places, cultural activities, and ideas around Brussels.|travel.explore|guide|visit.brussels
wikivoyage|Wikivoyage|https://en.wikivoyage.org/|Browse collaboratively written travel guides.|travel.explore|guide|Wikivoyage contributors
unesco|UNESCO World Heritage List|https://whc.unesco.org/en/list/|Explore cultural and natural heritage sites around the world.|travel.explore,creativity.culture|library|UNESCO
rome2rio|Rome2Rio|https://www.rome2rio.com/|Compare ways to travel between places as a starting point for planning.|travel.plan|tool|Rome2Rio
budgetbytes|Budget Bytes|https://www.budgetbytes.com/|Explore everyday recipes with ingredient and meal ideas.|food.recipes|publication|Budget Bytes
bbc-food|BBC Food|https://www.bbc.co.uk/food|Find recipes and cooking ideas by ingredient or occasion.|food.recipes,food.skills|library|BBC
serious-eats|Serious Eats|https://www.seriouseats.com/|Explore recipes, techniques, and explanations of kitchen processes.|food.skills|publication|Serious Eats
king-arthur|King Arthur Baking|https://www.kingarthurbaking.com/recipes|Find baking recipes and ideas for bread, pastry, and cakes.|food.baking|library|King Arthur Baking
the-perfect-loaf|The Perfect Loaf|https://www.theperfectloaf.com/|Explore sourdough baking, schedules, and bread-making techniques.|food.baking|guide|Maurizio Leo
minimalist-baker|Minimalist Baker|https://minimalistbaker.com/|Explore accessible recipes, including plant-based options and dietary filters.|food.plants|publication|Minimalist Baker
pick-up-limes|Pick Up Limes|https://www.pickuplimes.com/|Explore plant-based recipes and cooking ideas.|food.plants|publication|Pick Up Limes
food-waste|Love Food Hate Waste|https://www.lovefoodhatewaste.com/|Find ideas for food storage, leftovers, and reducing household food waste.|food.skills,making.home|guide|WRAP
ifixit|iFixit|https://www.ifixit.com/|Explore repair guides and learn how devices fit together.|making.repair,technology.open|guide|iFixit
repair-cafe|Repair Café|https://www.repaircafe.org/en/|Find information about community repair gatherings.|making.repair,social.groups|community|Repair Café International
arduino|Arduino|https://www.arduino.cc/|Explore electronics boards, programming tools, and project ideas.|making.electronics,technology.code|tool|Arduino
raspberry-pi|Raspberry Pi projects|https://projects.raspberrypi.org/en|Learn through coding, electronics, and digital making projects.|making.electronics,learning.courses|guide|Raspberry Pi Foundation
instructables|Instructables|https://www.instructables.com/|Explore step-by-step making projects from a creative community.|making.home,making.electronics|community|Instructables
rhs|RHS gardening|https://www.rhs.org.uk/|Explore gardening information and plant-growing advice.|making.garden|guide|Royal Horticultural Society
gardeners-world|Gardeners’ World|https://www.gardenersworld.com/|Explore seasonal growing ideas and plant guides.|making.garden|publication|Gardeners’ World
ravelry|Ravelry|https://www.ravelry.com/|Explore knitting and crochet patterns and project communities.|making.home,play.craft|community|Ravelry
alltrails|AllTrails|https://www.alltrails.com/|Explore walking routes and trail information from a hiking community.|outdoors.walk|tool|AllTrails
komoot|komoot|https://www.komoot.com/|Plan outdoor routes and discover walking and cycling tours.|outdoors.walk,outdoors.cycle|tool|komoot
waymarked|Waymarked Trails|https://hiking.waymarkedtrails.org/|Explore marked hiking routes over an OpenStreetMap base.|outdoors.walk,travel.maps|tool|Waymarked Trails
eurovelo|EuroVelo|https://en.eurovelo.com/|Explore a network of long-distance cycling routes across Europe.|outdoors.cycle,travel.plan|guide|European Cyclists’ Federation
cycling-uk|Cycling UK|https://www.cyclinguk.org/|Explore cycling information, route ideas, and community activities.|outdoors.cycle|community|Cycling UK
olympics|Olympics|https://www.olympics.com/|Explore sports, athletes, and Olympic stories.|outdoors.sport|publication|International Olympic Committee
uefa|UEFA|https://www.uefa.com/|Explore European football competitions and official coverage.|outdoors.sport|publication|UEFA
parkrun|parkrun|https://www.parkrun.com/|Find community walking and running events around the world.|outdoors.move,social.groups|community|parkrun
strava|Strava|https://www.strava.com/|Keep an activity record and connect with other active people.|outdoors.move,outdoors.cycle|tool|Strava
bluesky|Bluesky|https://bsky.app/|Follow conversations and choose feeds that suit your interests.|social.networks,social.open|community|Bluesky
mastodon|Mastodon|https://joinmastodon.org/|Find independently operated social communities in the fediverse.|social.open|community|Mastodon
pixelfed|Pixelfed|https://pixelfed.org/|Explore a federated photo-sharing platform.|social.open,creativity.photo|community|Pixelfed
peertube|PeerTube|https://joinpeertube.org/|Explore independently hosted video communities.|social.open,film.watch|community|Framasoft
reddit|Reddit|https://www.reddit.com/|Explore topic communities and discussions.|social.forums|community|Reddit
stackexchange|Stack Exchange|https://stackexchange.com/|Find question-and-answer communities organized around specific subjects.|social.forums,learning.reference|community|Stack Exchange
discord|Discord|https://discord.com/|Join shared spaces for conversations, games, and common interests.|social.groups,gaming.together|community|Discord
meetup|Meetup|https://www.meetup.com/|Find groups and events around shared interests.|social.groups|community|Meetup
linkedin|LinkedIn|https://www.linkedin.com/|Connect with professional communities and explore work-related updates.|social.networks,work.career|community|LinkedIn
duckduckgo|DuckDuckGo|https://duckduckgo.com/|A starting point for searching across the web.|tools.search|tool|DuckDuckGo
brave-search|Brave Search|https://search.brave.com/|Explore a search engine with its own web index.|tools.search|tool|Brave
startpage|Startpage|https://www.startpage.com/|Explore an alternative web-search interface.|tools.search|tool|Startpage
libreoffice|LibreOffice|https://www.libreoffice.org/|Work with documents, spreadsheets, and presentations on the desktop.|tools.files,work.collaborate|tool|The Document Foundation
pdf24|PDF24 Tools|https://tools.pdf24.org/en/|Explore tools for common PDF tasks.|tools.files|tool|PDF24
photopea|Photopea|https://www.photopea.com/|Edit images and design files in a browser-based editor.|tools.files,creativity.photo|tool|Photopea
deepl|DeepL|https://www.deepl.com/translator|Translate text between languages.|tools.language,learning.languages|tool|DeepL
wordreference|WordReference|https://www.wordreference.com/|Look up words and explore language discussions.|tools.language|tool|WordReference
languagetool|LanguageTool|https://languagetool.org/|Check spelling and writing in several languages.|tools.language,reading.writing|tool|LanguageTool
wolfram|WolframAlpha|https://www.wolframalpha.com/|Explore calculations and structured answers across subjects.|tools.everyday,learning.math|tool|Wolfram Research
timeanddate|timeanddate|https://www.timeanddate.com/|Look up time zones, calendars, and astronomical information.|tools.everyday|tool|timeanddate
windy|Windy|https://www.windy.com/|Explore weather layers on an interactive map.|tools.everyday,science.earth|tool|Windy
lichess|Lichess|https://lichess.org/|Play chess, solve puzzles, and study positions.|play.tabletop,gaming.strategy|game|Lichess
boardgamearena|Board Game Arena|https://boardgamearena.com/|Explore digital adaptations of board games with other players.|play.tabletop,gaming.together|website|Board Game Arena
boardgamegeek|BoardGameGeek|https://boardgamegeek.com/|Explore board-game information, discussions, and personal collections.|play.tabletop,play.collect|library|BoardGameGeek
origami|Origami Resource Center|https://www.origami-resource-center.com/|Explore paper-folding models, instructions, and ideas.|play.craft|guide|Origami Resource Center
drawabox|Drawabox|https://drawabox.com/|Practice drawing fundamentals through structured exercises.|play.craft,creativity.art|course|Drawabox
worldhistory|World History Encyclopedia|https://www.worldhistory.org/|Explore illustrated explanations of history and cultures.|play.history,learning.reference|publication|World History Encyclopedia
gallica|Gallica|https://gallica.bnf.fr/|Explore digitized books, newspapers, maps, and images from French collections.|play.history,reading.libraries|library|Bibliothèque nationale de France
internet-archive|Internet Archive|https://archive.org/|Explore archived websites and digital collections across media.|play.history,reading.libraries|library|Internet Archive
openverse|Openverse|https://openverse.org/|Discover openly licensed images and audio, with source and license details.|play.collect,creativity.photo|library|Openverse
numista|Numista|https://en.numista.com/|Explore coin and banknote records and organize a collection.|play.collect|library|Numista
`;

export const STARTER_CONTENT = rows.trim().split('\n').map(row=>{
  const [id,title,url,description,subjects,contentKind,creator]=row.split('|');
  return {id:`library-${id}`,title,url,description,subjects:subjects.split(','),contentKind,creator,type:'link'};
});
