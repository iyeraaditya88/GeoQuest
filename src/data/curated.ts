// Hand-curated physical geography + GeoGuessr "meta" for the most-played countries.
// Tips intentionally avoid naming the country so they can double as quiz clues.
// Anything not covered here is filled in by auto-derived tips (lib/tips.ts) and the AI.

export type TipKind = 'script' | 'road' | 'nature' | 'build' | 'car' | 'sign' | 'misc';
export interface Tip { k: TipKind; t: string }
export interface Curated {
  river: string;
  peak: string;
  range?: string;
  fact?: string;
  tips: Tip[];
}

const s = (t: string): Tip => ({ k: 'script', t });
const r = (t: string): Tip => ({ k: 'road', t });
const n = (t: string): Tip => ({ k: 'nature', t });
const b = (t: string): Tip => ({ k: 'build', t });
const c = (t: string): Tip => ({ k: 'car', t });
const g = (t: string): Tip => ({ k: 'sign', t });
const m = (t: string): Tip => ({ k: 'misc', t });

export const CURATED: Record<string, Curated> = {
  // ── North America ─────────────────────────────────────────
  USA: {
    river: 'Missouri River (3,767 km)', peak: 'Denali (6,190 m)', range: 'Rocky Mountains · Appalachians',
    fact: 'Has more Street View coverage than any other country — learn its regions, not just the country.',
    tips: [r('Double yellow centre lines with white edge lines'), g('Yellow diamond warning signs; speed limits in mph on white rectangles'), b('Wooden utility poles everywhere; mailboxes on posts by the road'), m('Plates vary by state — only some states require a front plate'), n('Red-rock desert in the Southwest, deciduous forest in the East, flat grid farmland in the Midwest')],
  },
  CAN: {
    river: 'Mackenzie River (1,738 km)', peak: 'Mount Logan (5,959 m)', range: 'Canadian Rockies · Coast Mountains',
    tips: [g('Speeds in km/h — the easy tell versus its southern neighbour'), s('French-only signs in Quebec, bilingual signs in New Brunswick and federal areas'), r('Yellow centre lines like the US, but often worn and on wide gravel shoulders'), n('Endless boreal forest of spruce and birch; Prairie flatlands in the middle'), g('Quebec stop signs say ARRÊT')],
  },
  MEX: {
    river: 'Rio Grande / Río Bravo (3,051 km, shared)', peak: 'Pico de Orizaba (5,636 m)', range: 'Sierra Madre Occidental & Oriental',
    tips: [s('Spanish; stop signs say ALTO (not PARE)'), r('Topes (speed bumps) signed everywhere'), b('Painted concrete houses with exposed rebar on roofs'), r('Highways called "Cuota" (toll) vs "Libre" (free)'), n('Cacti and scrubland in the north, tropical green in the south')],
  },
  GTM: {
    river: 'Motagua River (486 km)', peak: 'Volcán Tajumulco (4,220 m)', range: 'Sierra Madre de Chiapas',
    tips: [s('Spanish with ALTO stop signs'), n('Volcanic cones on the horizon in the highlands'), m('Colourful "chicken buses" — repainted US school buses'), b('Painted political slogans on rocks, poles and walls')],
  },
  CRI: {
    river: 'Río Grande de Térraba (196 km)', peak: 'Cerro Chirripó (3,821 m)', range: 'Cordillera de Talamanca',
    tips: [s('Spanish; ALTO stop signs'), n('Very lush, humid rainforest and steep green hills'), b('Houses behind barred fences and corrugated tin roofs'), r('Yellow centre lines on main roads')],
  },
  PAN: {
    river: 'Chucunaque River (231 km)', peak: 'Volcán Barú (3,474 m)', range: 'Cordillera de Talamanca',
    tips: [s('Spanish; PARE stop signs'), n('Tropical lowlands and Pacific coastline'), b('Concrete houses with bright pastel paint')],
  },
  DOM: {
    river: 'Yaque del Norte (296 km)', peak: 'Pico Duarte (3,098 m)', range: 'Cordillera Central',
    tips: [s('Spanish; PARE stop signs'), b('Brightly painted colmados (corner shops) with beer ads'), n('Palm trees and sugar-cane fields'), m('Motoconchos (motorbike taxis) everywhere')],
  },

  // ── South America ─────────────────────────────────────────
  BRA: {
    river: 'Amazon River (6,400 km, shared)', peak: 'Pico da Neblina (2,995 m)', range: 'Serra do Mar · Brazilian Highlands',
    tips: [s('Portuguese — look for "ão", "ç" and "Rua"'), n('Deep red-orange soil in the interior'), r('Yellow centre lines with white edges; black-and-yellow chevrons on curves'), g('Stop signs say PARE'), b('Low walls topped with spikes; hand-painted shop fronts')],
  },
  ARG: {
    river: 'Paraná River (4,880 km, shared)', peak: 'Aconcagua (6,961 m)', range: 'Andes',
    tips: [s('Spanish with "vos" forms; PARE stop signs'), n('Huge flat Pampas grasslands; arid Patagonian steppe in the south'), r('Yellow centre lines, often double'), m('Black-and-white Google car coverage with lots of long straight roads')],
  },
  CHL: {
    river: 'Loa River (440 km)', peak: 'Ojos del Salado (6,893 m)', range: 'Andes',
    fact: 'About 4,300 km long but averages only ~177 km wide.',
    tips: [s('Spanish; PARE stop signs'), r('White centre lines — unusual for South America'), n('Andes always visible to the east; Atacama desert in the north'), g('Road signs with black-on-white "km" posts')],
  },
  PER: {
    river: 'Ucayali–Amazon system (~3,600 km in-country)', peak: 'Huascarán (6,768 m)', range: 'Cordillera Blanca (Andes)',
    tips: [s('Spanish; PARE stop signs'), n('Barren sandy desert coast meets high Andes'), b('Unfinished adobe/brick houses with rebar on top'), m('Political party logos painted on walls')],
  },
  COL: {
    river: 'Magdalena River (1,528 km)', peak: 'Pico Cristóbal Colón (~5,730 m)', range: 'Andes (three cordilleras)',
    tips: [m('Yellow licence plates'), s('Spanish; PARE stop signs'), n('Very green, steep mountainous terrain'), r('Yellow centre lines with white edges')],
  },
  ECU: {
    river: 'Napo River (1,075 km)', peak: 'Chimborazo (6,263 m)', range: 'Andes',
    fact: 'Chimborazo’s summit is the farthest point on Earth from its centre.',
    tips: [s('Spanish; PARE stop signs'), n('Volcanoes and high páramo grassland in the Sierra'), m('White plates with a coloured top band')],
  },
  BOL: {
    river: 'Mamoré River (~1,930 km)', peak: 'Nevado Sajama (6,542 m)', range: 'Cordillera Real (Andes)',
    tips: [s('Spanish; PARE stop signs'), n('Treeless Altiplano at ~3,800 m, salt flats'), b('Red-brick buildings, often unplastered')],
  },
  URY: {
    river: 'Uruguay River (1,838 km, shared)', peak: 'Cerro Catedral (514 m)', range: 'Cuchilla Grande (hills)',
    tips: [s('Spanish; PARE stop signs'), n('Gently rolling green grassland with eucalyptus'), r('Yellow centre lines'), m('Plates are white with blue "URUGUAY" lettering')],
  },
  VEN: {
    river: 'Orinoco River (2,140 km)', peak: 'Pico Bolívar (4,978 m)', range: 'Cordillera de Mérida (Andes)',
    fact: 'Home to Angel Falls (979 m), the world’s tallest uninterrupted waterfall.',
    tips: [s('Spanish'), n('Tepuis — flat-topped table mountains — in the south-east')],
  },
  PRY: {
    river: 'Paraná / Paraguay rivers', peak: 'Cerro Peró (842 m)', range: '—',
    tips: [s('Spanish and Guaraní'), n('Red soil and flat terrain, similar to southern Brazil')],
  },

  // ── Western Europe ────────────────────────────────────────
  GBR: {
    river: 'River Severn (354 km)', peak: 'Ben Nevis (1,345 m)', range: 'Scottish Highlands (Grampians)',
    tips: [r('Drives on the left; white dashed centre lines'), m('Yellow rear plate, white front plate'), r('Double yellow lines along kerbs mean no parking'), b('Brick terraced houses and chimney pots'), g('Signs use miles and mph')],
  },
  IRL: {
    river: 'River Shannon (360 km)', peak: 'Carrauntoohil (1,039 m)', range: "MacGillycuddy's Reeks",
    tips: [r('Drives on the left with yellow edge lines/hard shoulders'), s('Bilingual signs: Irish in italics above English'), g('Distances and speeds in km/h — unlike Northern Ireland'), n('Stone walls and very green fields')],
  },
  FRA: {
    river: 'Loire (1,006 km)', peak: 'Mont Blanc (4,806 m)', range: 'Alps · Pyrenees',
    tips: [r('All road lines are white'), m('Plates have a blue EU band and a blue regional band on the right'), g('Town entry signs: white with red border'), b('White/cream houses with terracotta or slate roofs'), s('French — "Rue", "Route", "Centre Ville"')],
  },
  ESP: {
    river: 'Tagus / Tajo (1,007 km, shared)', peak: 'Teide (3,715 m, Tenerife)', range: 'Pyrenees · Sierra Nevada',
    tips: [s('Spanish — and Catalan, Basque or Galician in some regions'), n('Dry olive groves and arid hills in the interior'), r('White lines; chevrons are often red/white'), b('White-washed villages in Andalusia')],
  },
  PRT: {
    river: 'Tagus / Tejo (1,007 km, shared)', peak: 'Mount Pico (2,351 m, Azores)', range: 'Serra da Estrela',
    tips: [s('Portuguese with "ão" and "ç" — but European spellings'), m('Plates have a yellow band on the right'), b('White houses with blue tiles (azulejos)'), n('Eucalyptus forests and cork oaks')],
  },
  ITA: {
    river: 'Po (652 km)', peak: 'Mont Blanc / Monte Bianco (4,806 m)', range: 'Alps · Apennines',
    tips: [s('Italian — "Via", "Strada", "Piazza"'), m('Plates have blue bands on both sides'), b('Terracotta roofs and ochre/orange walls'), g('Motorway signs are green, normal roads blue (reverse of Germany)')],
  },
  DEU: {
    river: 'Rhine (865 km in-country) / Danube', peak: 'Zugspitze (2,962 m)', range: 'Bavarian Alps',
    tips: [s('German — "Straße", "ß", umlauts'), g('Town signs are yellow rectangles'), m('Long, narrow white plates with a blue EU band'), r('Bollards are white with a black band and a white reflector'), b('Neat houses with dark tiled roofs')],
  },
  NLD: {
    river: 'Rhine / Meuse deltas', peak: 'Vaalserberg (322 m, mainland)', range: '—',
    tips: [m('Yellow licence plates (front and rear)'), b('Red-brick buildings and lots of canals'), r('Red bicycle lanes everywhere'), n('Completely flat; windmills and polders')],
  },
  BEL: {
    river: 'Meuse (925 km, shared)', peak: 'Signal de Botrange (694 m)', range: 'Ardennes',
    tips: [m('White plates with red characters'), s('Dutch in the north, French in the south'), b('Red-brick houses, often narrow and attached')],
  },
  CHE: {
    river: 'Rhine (375 km in-country)', peak: 'Dufourspitze (4,634 m)', range: 'Alps · Jura',
    tips: [s('German, French or Italian depending on region'), m('White plates with a canton crest'), n('Snow-capped Alps and very tidy landscapes'), g('Yellow hiking signposts')],
  },
  AUT: {
    river: 'Danube (350 km in-country)', peak: 'Grossglockner (3,798 m)', range: 'Alps',
    tips: [s('German with Austrian dialect words'), m('Plates have red-white-red stripes at top and bottom'), n('Alpine valleys with chalet-style houses')],
  },
  LUX: {
    river: 'Sauer / Sûre (173 km)', peak: 'Kneiff (560 m)', range: 'Ardennes (Oesling)',
    tips: [m('Yellow plates, like the Netherlands'), s('French and German signs, Luxembourgish place names')],
  },
  AND: {
    river: 'Gran Valira', peak: 'Coma Pedrosa (2,942 m)', range: 'Pyrenees',
    tips: [s('Catalan is the official language'), n('Steep, narrow mountain valleys')],
  },
  MLT: {
    river: 'No permanent rivers', peak: "Ta' Dmejrek (253 m)", range: '—',
    tips: [r('Drives on the left'), b('Limestone-yellow buildings with enclosed wooden balconies'), s('Maltese (Latin script with ħ, ġ, ż) and English')],
  },

  // ── Northern Europe ───────────────────────────────────────
  NOR: {
    river: 'Glomma (621 km)', peak: 'Galdhøpiggen (2,469 m)', range: 'Scandinavian Mountains',
    tips: [r('Yellow centre lines — rare in Europe'), s('Letters æ, ø, å'), n('Fjords, steep cliffs and dark green conifer forest'), b('Red and white wooden houses')],
  },
  SWE: {
    river: 'Klarälven–Göta älv (720 km)', peak: 'Kebnekaise (~2,097 m)', range: 'Scandinavian Mountains',
    tips: [s('Letters å, ä, ö (no ø or æ)'), b('Falu-red wooden houses with white trim'), r('White road lines'), n('Flat to rolling forest with many lakes')],
  },
  FIN: {
    river: 'Kemijoki (550 km)', peak: 'Halti (1,324 m)', range: '—',
    tips: [s('Finnish — lots of double vowels (aa, ää) and "kk"'), n('Endless birch and pine forest with lakes'), s('Bilingual Finnish/Swedish signs on the west coast')],
  },
  DNK: {
    river: 'Gudenå (176 km)', peak: 'Møllehøj (171 m)', range: '—',
    tips: [s('Letters æ, ø, å'), n('Very flat farmland'), b('Red/yellow brick houses with thatched or tiled roofs')],
  },
  ISL: {
    river: 'Þjórsá (230 km)', peak: 'Hvannadalshnúkur (2,110 m)', range: 'Vatnajökull',
    tips: [s('Letters þ and ð — unique to Icelandic'), n('Treeless volcanic landscape, moss and lava fields'), r('Yellow-topped roadside posts')],
  },
  EST: {
    river: 'Pärnu River (144 km)', peak: 'Suur Munamägi (318 m)', range: '—',
    tips: [s('Estonian uses õ, ä, ö, ü — õ is the giveaway'), n('Flat forest and bog')],
  },
  LVA: {
    river: 'Daugava (1,020 km, shared)', peak: 'Gaiziņkalns (312 m)', range: '—',
    tips: [s('Latvian uses macrons (ā, ē, ī, ū) and ķ, ļ, ņ'), n('Flat pine forests and wooden houses')],
  },
  LTU: {
    river: 'Neman (937 km, shared)', peak: 'Aukštojas (294 m)', range: '—',
    tips: [s('Lithuanian uses ė, ų, į, š, ž — ė is distinctive'), n('Flat farmland with forests')],
  },

  // ── Central & Eastern Europe ──────────────────────────────
  POL: {
    river: 'Vistula (1,047 km)', peak: 'Rysy (2,499 m)', range: 'Tatras (Carpathians)',
    tips: [s('Polish letters ł, ż, ś, ć, ń'), b('Blocky houses with steep roofs'), n('Mostly flat farmland and pine forest')],
  },
  CZE: {
    river: 'Vltava (430 km)', peak: 'Sněžka (1,603 m)', range: 'Krkonoše (Giant Mountains)',
    tips: [s('Czech uses ř, ě and ů — ř and ů are giveaways'), b('Orange tiled roofs'), n('Rolling hills and fields')],
  },
  SVK: {
    river: 'Váh (403 km)', peak: 'Gerlachovský štít (2,655 m)', range: 'High Tatras',
    tips: [s('Slovak uses ä, ô, ĺ, ŕ — no ř or ů like Czech'), n('Mountainous and forested')],
  },
  HUN: {
    river: 'Tisza (597 km in-country) / Danube', peak: 'Kékes (1,014 m)', range: 'Mátra Mountains',
    tips: [s('Hungarian uses ő and ű — double accents are unique'), n('Very flat plains (the Great Hungarian Plain)')],
  },
  ROU: {
    river: 'Mureș (789 km) / Danube', peak: 'Moldoveanu (2,544 m)', range: 'Carpathians',
    tips: [s('Romanian uses ă, â, î, ș, ț'), b('Ornate metal roofs and gates in villages'), n('Carpathian hills and horse-drawn carts')],
  },
  BGR: {
    river: 'Iskar (368 km) / Danube', peak: 'Musala (2,925 m)', range: 'Rila · Balkan Mountains',
    tips: [s('Cyrillic alphabet, often with Latin transliteration on road signs'), b('Older Soviet-era apartment blocks in towns')],
  },
  GRC: {
    river: 'Aliakmonas (297 km)', peak: 'Mount Olympus (2,918 m)', range: 'Pindus Mountains',
    tips: [s('Greek alphabet; road signs repeat names in Latin letters'), n('Dry, rocky hills with olive trees'), b('White and terracotta houses; roadside shrines')],
  },
  TUR: {
    river: 'Kızılırmak (1,355 km)', peak: 'Mount Ararat (5,137 m)', range: 'Taurus · Pontic Mountains',
    tips: [s('Turkish letters ş, ğ, ı (dotless i)'), m('Plates with a blue band; registration starts with a province number'), b('Mosques with slim minarets'), n('Dry central plateau, green Black Sea coast')],
  },
  RUS: {
    river: 'Ob–Irtysh (5,410 km) · Volga longest in Europe', peak: 'Mount Elbrus (5,642 m)', range: 'Ural · Caucasus',
    tips: [s('Cyrillic — look for ы and э (absent in Ukrainian/Bulgarian)'), n('Birch forests and huge flat steppes'), b('Wooden dachas and Soviet-era apartment blocks')],
  },
  UKR: {
    river: 'Dnieper (2,201 km, shared)', peak: 'Hoverla (2,061 m)', range: 'Carpathians',
    tips: [s('Cyrillic with і and ї — those mean Ukrainian, not Russian'), n('Fertile flat black-earth farmland')],
  },
  SRB: {
    river: 'Great Morava (185 km) / Danube', peak: 'Midžor (2,169 m)', range: 'Balkan Mountains',
    tips: [s('Uses both Cyrillic and Latin script'), b('Red-brick houses, often unfinished')],
  },
  HRV: {
    river: 'Sava (562 km in-country)', peak: 'Dinara (1,831 m)', range: 'Dinaric Alps',
    tips: [s('Latin letters č, ć, š, ž, đ'), n('Rocky white limestone coast with clear blue sea')],
  },
  SVN: {
    river: 'Sava (221 km in-country)', peak: 'Triglav (2,864 m)', range: 'Julian Alps',
    tips: [s('Uses č, š, ž but not ć or đ (unlike Croatian)'), n('Alpine, green and forested')],
  },
  MNE: {
    river: 'Tara (144 km)', peak: 'Zla Kolata (2,534 m)', range: 'Dinaric Alps',
    tips: [s('Latin and Cyrillic both used'), n('Steep mountains plunging into the Adriatic')],
  },
  ALB: {
    river: 'Drin (335 km)', peak: 'Korab (2,764 m)', range: 'Albanian Alps',
    tips: [s('Albanian uses ë and ç; words often end in "-i" or "-a"'), b('Many concrete bunkers and unfinished buildings'), m('Mercedes cars are extremely common')],
  },
  MKD: {
    river: 'Vardar (388 km)', peak: 'Korab (2,764 m)', range: 'Šar Mountains',
    tips: [s('Cyrillic with ѓ and ќ — unique to Macedonian'), n('Dry mountainous landscape')],
  },

  // ── Asia ──────────────────────────────────────────────────
  CHN: {
    river: 'Yangtze (6,300 km)', peak: 'Mount Everest (8,849 m, shared)', range: 'Himalayas · Kunlun',
    fact: 'Uses a single time zone (UTC+8) despite spanning ~5 geographical ones.',
    tips: [s('Simplified Chinese characters'), m('Very limited official Street View — mostly user photospheres')],
  },
  JPN: {
    river: 'Shinano River (367 km)', peak: 'Mount Fuji (3,776 m)', range: 'Japanese Alps',
    tips: [r('Drives on the left'), s('Kana + kanji script'), b('Dense overhead wires; utility poles with yellow-black stripes'), r('Narrow roads with convex mirrors at corners'), m('Small boxy "kei" cars with yellow plates')],
  },
  KOR: {
    river: 'Nakdong River (510 km)', peak: 'Hallasan (1,947 m)', range: 'Taebaek Mountains',
    tips: [s('Hangul — circles and straight lines'), r('Yellow centre lines'), b('Green-roofed rural houses and high-rise apartment blocks')],
  },
  TWN: {
    river: 'Zhuoshui River (186 km)', peak: 'Yushan (3,952 m)', range: 'Central Mountain Range',
    tips: [s('Traditional (complex) Chinese characters'), m('Scooters everywhere'), b('Tiled apartment buildings with metal security grilles')],
  },
  MNG: {
    river: 'Orkhon River (1,124 km)', peak: 'Khüiten Peak (4,374 m)', range: 'Altai Mountains',
    tips: [s('Cyrillic with ө and ү'), n('Vast treeless steppe'), b('White gers (yurts)')],
  },
  IND: {
    river: 'Ganges (2,525 km)', peak: 'Kangchenjunga (8,586 m)', range: 'Himalayas',
    tips: [r('Drives on the left'), s('Devanagari plus many regional scripts'), r('Black-and-yellow painted kerbs'), m('Auto-rickshaws and dense traffic')],
  },
  PAK: {
    river: 'Indus (3,180 km)', peak: 'K2 (8,611 m)', range: 'Karakoram · Hindu Kush',
    tips: [r('Drives on the left'), s('Urdu in Perso-Arabic script'), m('Elaborately decorated "jingle" trucks')],
  },
  BGD: {
    river: 'Padma / Meghna (Ganges–Brahmaputra delta)', peak: 'Saka Haphong (~1,050 m)', range: 'Chittagong Hill Tracts',
    tips: [r('Drives on the left'), s('Bengali script — look for the flat top line'), n('Very flat, green and wet; many rivers')],
  },
  NPL: {
    river: 'Karnali (507 km)', peak: 'Mount Everest (8,849 m)', range: 'Himalayas',
    tips: [r('Drives on the left'), s('Devanagari script'), n('Terraced hillsides')],
  },
  BTN: {
    river: 'Manas River (376 km)', peak: 'Gangkhar Puensum (7,570 m)', range: 'Himalayas',
    tips: [r('Drives on the left'), s('Dzongkha in Tibetan script'), b('Painted wooden windows and prayer flags')],
  },
  LKA: {
    river: 'Mahaweli (335 km)', peak: 'Pidurutalagala (2,524 m)', range: 'Central Highlands',
    tips: [r('Drives on the left'), s('Sinhala (round, loopy letters) and Tamil'), n('Tea plantations in the highlands')],
  },
  THA: {
    river: 'Mun River (641 km)', peak: 'Doi Inthanon (2,565 m)', range: 'Thanon Thong Chai Range',
    tips: [r('Drives on the left'), s('Thai script — loops on top of letters'), r('Black-and-white striped kerbs'), b('Dense electrical wires on concrete poles')],
  },
  VNM: {
    river: 'Red River & Mekong (shared)', peak: 'Fansipan (3,143 m)', range: 'Hoàng Liên Sơn',
    tips: [s('Latin script with lots of stacked diacritics (ư, ơ, ầ)'), b('Tall narrow "tube houses"'), m('Swarms of motorbikes')],
  },
  KHM: {
    river: 'Mekong River', peak: 'Phnom Aural (1,813 m)', range: 'Cardamom Mountains',
    tips: [s('Khmer script'), n('Flat and dry with palm trees, red dirt roads')],
  },
  LAO: {
    river: 'Mekong River', peak: 'Phou Bia (2,819 m)', range: 'Annamite Range',
    tips: [s('Lao script — rounder and simpler than Thai'), n('Mountainous jungle')],
  },
  MYS: {
    river: 'Rajang River (563 km)', peak: 'Mount Kinabalu (4,095 m)', range: 'Titiwangsa · Crocker Range',
    tips: [r('Drives on the left'), s('Malay in Latin script'), m('Black plates with white characters'), n('Palm-oil plantations')],
  },
  SGP: {
    river: 'Kallang River (10 km)', peak: 'Bukit Timah Hill (164 m)', range: '—',
    tips: [r('Drives on the left'), b('Dense high-rise public housing'), s('Signs in English, Chinese, Malay and Tamil')],
  },
  IDN: {
    river: 'Kapuas River (1,143 km)', peak: 'Puncak Jaya (4,884 m)', range: 'Sudirman Range',
    tips: [r('Drives on the left'), s('Indonesian in Latin script — "Jalan" (Jl.)'), m('Black plates; lots of motorbikes'), b('Mosques with domed roofs')],
  },
  PHL: {
    river: 'Cagayan River (505 km)', peak: 'Mount Apo (2,954 m)', range: 'Cordillera Central · Sierra Madre',
    tips: [r('Drives on the RIGHT — unlike most of SE Asia'), s('English and Filipino'), m('Jeepneys and tricycles'), n('Rice terraces and coconut palms')],
  },
  ISR: {
    river: 'Jordan River (251 km)', peak: 'Mount Meron (1,208 m)', range: '—',
    tips: [s('Hebrew script, often with Arabic and English'), m('Yellow licence plates'), n('Dry, dusty landscape')],
  },
  JOR: {
    river: 'Jordan River', peak: 'Jabal Umm al-Dami (1,854 m)', range: '—',
    tips: [s('Arabic script'), b('Blocky cream-coloured stone buildings'), n('Desert and rocky hills')],
  },
  ARE: {
    river: 'No permanent rivers', peak: 'Jebel Jais (1,934 m)', range: 'Hajar Mountains',
    tips: [s('Arabic and English signs'), b('Modern high-rises and wide highways'), n('Sand desert')],
  },
  QAT: {
    river: 'No permanent rivers', peak: 'Qurayn Abu al-Bawl (103 m)', range: '—',
    tips: [s('Arabic and English signs'), n('Flat desert peninsula')],
  },
  SAU: {
    river: 'No permanent rivers', peak: 'Jabal Sawda (~3,000 m)', range: 'Sarawat · Asir Mountains',
    tips: [s('Arabic script'), n('Vast sand and rock desert')],
  },
  IRN: {
    river: 'Karun (950 km)', peak: 'Mount Damavand (5,609 m)', range: 'Zagros · Alborz',
    tips: [s('Persian in Arabic script')],
  },
  KAZ: {
    river: 'Irtysh (1,700 km in-country) / Ural', peak: 'Khan Tengri (7,010 m)', range: 'Tian Shan',
    tips: [s('Cyrillic with extra letters ә, ғ, қ, ң, ө, ұ, ү, һ, і'), n('Endless flat steppe')],
  },
  KGZ: {
    river: 'Naryn River (807 km)', peak: 'Jengish Chokusu (7,439 m)', range: 'Tian Shan',
    tips: [s('Cyrillic with ң, ө, ү'), n('High mountain valleys and yurts')],
  },

  // ── Oceania ───────────────────────────────────────────────
  AUS: {
    river: 'Murray River (2,508 km)', peak: 'Mount Kosciuszko (2,228 m)', range: 'Great Dividing Range',
    tips: [r('Drives on the left'), n('Red soil and eucalyptus (gum) trees'), g('Yellow diamond warning signs'), r('White edge lines; roadside posts with red reflectors')],
  },
  NZL: {
    river: 'Waikato River (425 km)', peak: 'Aoraki / Mount Cook (3,724 m)', range: 'Southern Alps',
    tips: [r('Drives on the left'), n('Very green rolling pasture with sheep'), s('Māori place names (Wh-, Ng-, lots of vowels)')],
  },

  // ── Africa ────────────────────────────────────────────────
  ZAF: {
    river: 'Orange River (2,200 km)', peak: 'Mafadi (3,450 m)', range: 'Drakensberg',
    tips: [r('Drives on the left'), r('Yellow edge lines on highways'), s('English and Afrikaans ("Straat", "Weg")'), b('Corrugated-iron roofs; walls topped with electric fencing')],
  },
  BWA: {
    river: 'Okavango (1,600 km, shared)', peak: 'Otse Hill (1,491 m)', range: '—',
    tips: [r('Drives on the left'), n('Flat dry savanna with acacia scrub'), r('Yellow edge lines')],
  },
  NAM: {
    river: 'Orange / Kunene rivers', peak: 'Königstein, Brandberg (2,573 m)', range: '—',
    tips: [r('Drives on the left'), n('Desert and dunes; very sparse'), r('Long gravel roads')],
  },
  LSO: {
    river: 'Orange / Senqu River', peak: 'Thabana Ntlenyana (3,482 m)', range: 'Maloti · Drakensberg',
    fact: 'The only country entirely above 1,000 m.',
    tips: [r('Drives on the left'), n('High, treeless mountains'), b('Round stone huts with thatched roofs')],
  },
  SWZ: {
    river: 'Great Usutu (217 km)', peak: 'Emlembe (1,862 m)', range: '—',
    tips: [r('Drives on the left'), n('Green hills and sugar cane')],
  },
  KEN: {
    river: 'Tana River (~1,000 km)', peak: 'Mount Kenya (5,199 m)', range: 'Great Rift Valley',
    tips: [r('Drives on the left'), c('Google car often has a visible snorkel'), s('English and Swahili'), n('Red soil and savanna')],
  },
  TZA: {
    river: 'Rufiji River (~600 km)', peak: 'Kilimanjaro (5,895 m)', range: 'Eastern Arc Mountains',
    tips: [r('Drives on the left'), s('Swahili')],
  },
  UGA: {
    river: 'White Nile', peak: 'Margherita Peak (5,109 m)', range: 'Rwenzori',
    tips: [r('Drives on the left'), n('Very green and lush with red soil'), m('Boda-boda motorbike taxis')],
  },
  RWA: {
    river: 'Nyabarongo (351 km)', peak: 'Mount Karisimbi (4,507 m)', range: 'Virunga Mountains',
    tips: [r('Drives on the RIGHT — unlike its eastern neighbours'), n('Hilly and green — "land of a thousand hills"'), s('Kinyarwanda, English and French')],
  },
  ETH: {
    river: 'Shebelle (1,000 km+) · Blue Nile', peak: 'Ras Dashen (4,550 m)', range: 'Simien Mountains',
    tips: [s('Ge’ez (Amharic) script — unique syllabary')],
  },
  NGA: {
    river: 'Niger River (shared)', peak: 'Chappal Waddi (2,419 m)', range: 'Mambilla Plateau',
    tips: [r('Drives on the right'), s('English signs'), m('Yellow taxis and tricycles (keke)')],
  },
  GHA: {
    river: 'Volta River (1,500 km)', peak: 'Mount Afadja (885 m)', range: 'Akwapim-Togo Ranges',
    tips: [r('Drives on the right'), s('English signs'), n('Red dirt and palms')],
  },
  SEN: {
    river: 'Senegal River (1,086 km, shared)', peak: 'Unnamed hill near Nepen Diakha (648 m)', range: '—',
    tips: [s('French signs'), n('Sandy, flat landscape with baobab trees')],
  },
  EGY: {
    river: 'Nile (6,650 km, shared)', peak: 'Mount Catherine (2,629 m)', range: 'Sinai Mountains',
    tips: [s('Arabic script'), n('Desert with a thin green strip along the Nile')],
  },
  MAR: {
    river: 'Draa River (1,100 km)', peak: 'Toubkal (4,167 m)', range: 'Atlas Mountains',
    tips: [s('Arabic, French and Tifinagh (Berber) script'), b('Red-earth kasbahs')],
  },
  TUN: {
    river: 'Medjerda (450 km)', peak: 'Jebel ech Chambi (1,544 m)', range: 'Atlas (Dorsal)',
    tips: [s('Arabic and French'), b('White houses with blue doors and shutters')],
  },
  MDG: {
    river: 'Mangoky River (564 km)', peak: 'Maromokotro (2,876 m)', range: 'Tsaratanana Massif',
    tips: [s('Malagasy and French'), n('Red laterite soil — "the Great Red Island"')],
  },

  // ── Misc islands ──────────────────────────────────────────
  CYP: {
    river: 'Pedieos (98 km)', peak: 'Mount Olympus (1,952 m)', range: 'Troodos Mountains',
    tips: [r('Drives on the left'), s('Greek script (and Turkish in the north)')],
  },
  GRL: {
    river: 'No major rivers (ice-covered)', peak: 'Gunnbjørn Fjeld (3,694 m)', range: 'Watkins Range',
    tips: [s('Greenlandic — very long words with lots of q and k'), b('Brightly painted wooden houses')],
  },
};
