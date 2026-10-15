// Eras of civilization: from the first stone tools to today. For each era: where people lived (its
// heart, its thriving centres, and — where estimates exist — how humanity was shared between the
// continents), how they lived, what they invented, what happened, and how it gave way to the next.
// Dates and numbers are the usual scholarly estimates — rounded, and often debated.

export type LL = [number, number];
export interface Place { name: string; at: LL; note: string }
export interface Era {
  id: string;
  name: string;
  emoji: string;
  span: string;            // "c. 3300 – 1200 BCE"
  lasted: string;          // "about 2,000 years"
  color: string;
  tagline: string;
  population: string;      // at the era's end
  pop: number;             // the same, as a number (for the chart)
  summary: string;
  heart: Place;            // the centre of the human world
  share?: { asia: number; europe: number; africa: number; americas: number; oceania: number; year: string };
  hubs: Place[];           // where people thrived
  life: string[];          // how most people lived and worked
  inventions: { name: string; when: string; emoji: string }[];
  events: { when: string; text: string }[];
  next: string;            // how it turned into the next era
  routes: { name: string; points: LL[] }[];
  wiki: string;
}

export const ERAS: Era[] = [
  {
    id: 'paleolithic', name: 'Old Stone Age', emoji: '🪨', span: 'c. 3.3 million – 10,000 BCE', lasted: 'over 3 million years', color: '#d6a36a',
    tagline: 'Hunters and gatherers spread from Africa to every continent but Antarctica',
    population: '≈ 4 million', pop: 4e6,
    summary: 'For more than 99% of the human story, people lived in small, wandering bands, hunting animals and gathering plants. Our species, Homo sapiens, appeared in Africa about 300,000 years ago and, from around 70,000 years ago, spread across the world — through ice ages, on foot and by boat.',
    heart: { name: 'East Africa', at: [-3, 35.5], note: 'The cradle of humankind: the oldest stone tools and many of our ancestors’ fossils come from the Rift Valley.' },
    hubs: [
      { name: 'Olduvai Gorge', at: [-2.99, 35.35], note: 'Tanzania — nearly 2 million years of tools and fossils.' },
      { name: 'Jebel Irhoud', at: [31.86, -8.87], note: 'Morocco — the oldest known Homo sapiens fossils, about 300,000 years old.' },
      { name: 'Blombos Cave', at: [-34.41, 21.22], note: 'South Africa — engraved ochre and shell beads, about 75,000 years old.' },
      { name: 'Sulawesi caves', at: [-4.9, 119.6], note: 'Indonesia — some of the oldest known cave paintings, over 45,000 years old.' },
      { name: 'Madjedbebe', at: [-12.5, 132.9], note: 'Australia — people were here at least 50,000 years ago, having crossed the sea.' },
      { name: 'Lascaux', at: [45.05, 1.17], note: 'France — painted horses, bulls and deer, about 17,000 years old.' },
      { name: 'Monte Verde', at: [-41.5, -73.2], note: 'Chile — a camp about 14,500 years old, near the end of the long walk through the Americas.' },
    ],
    life: [
      'Hunting, fishing and gathering wild plants, moving with the seasons.',
      'Bands of perhaps 25–50 people, linked to neighbours by marriage and trade.',
      'Making tools of stone, bone, wood and antler; sewing clothes from hides.',
    ],
    inventions: [
      { name: 'Stone tools', when: '3.3 million years ago', emoji: '🪨' },
      { name: 'Control of fire', when: 'by 400,000 years ago', emoji: '🔥' },
      { name: 'Language', when: 'gradually — debated', emoji: '🗣️' },
      { name: 'Art & jewellery', when: '~75,000 years ago', emoji: '🎨' },
      { name: 'Boats', when: '50,000+ years ago', emoji: '🛶' },
      { name: 'Sewing needles', when: '~40,000 years ago', emoji: '🪡' },
      { name: 'Bow and arrow', when: '~60,000 years ago', emoji: '🏹' },
    ],
    events: [
      { when: '~300,000 years ago', text: 'Homo sapiens appears in Africa.' },
      { when: '~70,000 – 50,000 years ago', text: 'Modern humans spread out of Africa, into Asia and on to Australia.' },
      { when: '~40,000 years ago', text: 'Neanderthals disappear; many of us still carry a little of their DNA.' },
      { when: '~20,000 years ago', text: 'The Last Glacial Maximum: ice sheets cover much of North America and northern Europe.' },
      { when: 'by ~15,000 years ago', text: 'People reach the Americas across Beringia, the land bridge from Siberia.' },
    ],
    next: 'As the last Ice Age ended about 11,700 years ago, the climate grew warmer and steadier. In the hills of the Fertile Crescent, people began to plant the wild grains they had long gathered — and to stay put. The Neolithic Revolution had begun.',
    routes: [
      { name: 'Out of Africa — the southern route', points: [[-3, 36], [8, 39], [12.6, 43.4], [15, 50], [22, 59], [25, 66], [20, 73], [15, 80], [17, 94], [5, 100], [-2, 106], [-8, 118], [-10, 125], [-12.5, 132.9]] },
      { name: 'Into Europe', points: [[8, 39], [20, 33], [30, 32], [32.7, 35.3], [38, 35], [42, 25], [45, 15], [45.05, 1.17]] },
      { name: 'Into the Americas', points: [[32.7, 35.3], [40, 60], [45, 90], [55, 120], [65, 170], [65, -168], [60, -140], [50, -125], [35, -120], [15, -95], [0, -80], [-20, -71], [-41.5, -73.2]] },
    ],
    wiki: 'Paleolithic',
  },
  {
    id: 'neolithic', name: 'New Stone Age', emoji: '🌾', span: 'c. 10,000 – 3300 BCE', lasted: 'about 6,700 years', color: '#a3e635',
    tagline: 'Farming begins — and with it, villages, pottery and property',
    population: '≈ 4 → 20 million', pop: 2e7,
    summary: 'In a few places at once — the Fertile Crescent, China, New Guinea, Mexico and the Andes — people tamed plants and animals. Farming fed far more people than foraging, so families settled in villages, and populations began to climb.',
    heart: { name: 'The Fertile Crescent', at: [35, 40], note: 'The arc of land from the Nile through the Levant to Mesopotamia, where wheat, barley, sheep and goats were first domesticated.' },
    hubs: [
      { name: 'Göbekli Tepe', at: [37.22, 38.92], note: 'Turkey — carved stone pillars about 11,500 years old, older than farming itself.' },
      { name: 'Jericho', at: [31.87, 35.44], note: 'One of the oldest continuously inhabited towns, with a stone wall and tower around 8000 BCE.' },
      { name: 'Çatalhöyük', at: [37.67, 32.83], note: 'Turkey — a town of thousands, houses packed together, entered through the roof.' },
      { name: 'Yangtze & Yellow rivers', at: [33.6, 113.7], note: 'China — rice in the south and millet in the north, from about 7000 BCE.' },
      { name: 'Kuk Swamp', at: [-5.78, 144.33], note: 'New Guinea — farmers growing taro and bananas almost 7,000 years ago.' },
      { name: 'Mehrgarh', at: [29.4, 67.6], note: 'Pakistan — farming village and forerunner of the Indus civilization.' },
      { name: 'Oaxaca & Balsas valleys', at: [17.5, -98], note: 'Mexico — squash and maize, the grain of the Americas, domesticated here.' },
    ],
    life: [
      'Farming: sowing, weeding and harvesting crops; keeping sheep, goats, pigs and cattle.',
      'Living in permanent villages of mud-brick, stone or timber houses.',
      'Making pottery, weaving cloth, grinding grain — and storing food for the year.',
    ],
    inventions: [
      { name: 'Farming', when: '~9500 BCE', emoji: '🌾' },
      { name: 'Domestic animals', when: '~8500 BCE', emoji: '🐐' },
      { name: 'Pottery', when: 'widespread by ~7000 BCE', emoji: '🏺' },
      { name: 'Weaving', when: '~7000 BCE', emoji: '🧵' },
      { name: 'Copper smelting', when: '~5000 BCE', emoji: '🟠' },
      { name: 'The wheel', when: '~3500 BCE', emoji: '☸️' },
      { name: 'Megaliths', when: '~4500 BCE onwards', emoji: '🗿' },
    ],
    events: [
      { when: '~9500 BCE', text: 'Göbekli Tepe is built — temples before towns.' },
      { when: '~8000 BCE', text: 'Jericho raises its wall and tower.' },
      { when: '~7000 BCE', text: 'Rice farming on the Yangtze; maize in Mexico.' },
      { when: '~6500 BCE', text: 'Farming spreads from Anatolia into Europe.' },
      { when: '~3500 BCE', text: 'The “Green Sahara” dries out, pushing people toward the Nile.' },
    ],
    next: 'Farmers learned to smelt copper — and then to mix it with tin, making hard, bright bronze. Surplus food let some people become full-time craftsmen, priests and rulers, and in the river valleys of Mesopotamia and Egypt the first cities and writing appeared.',
    routes: [
      { name: 'Farming spreads into Europe', points: [[36, 40], [37.67, 32.83], [40, 26], [41, 22], [45, 20], [48, 15], [50, 8], [51, 1.5], [51.18, -1.83]] },
      { name: 'Farming spreads to the Nile and the Indus', points: [[36, 40], [33, 36], [30, 31.2]] },
      { name: 'East to the Indus', points: [[36, 40], [34, 46], [32, 52], [30, 60], [29.4, 67.6]] },
    ],
    wiki: 'Neolithic',
  },
  {
    id: 'bronze', name: 'Bronze Age', emoji: '🏺', span: 'c. 3300 – 1200 BCE', lasted: 'about 2,000 years', color: '#f59e0b',
    tagline: 'The first cities, kingdoms and writing — along the great rivers',
    population: '≈ 50 million', pop: 5e7,
    summary: 'Along the Tigris and Euphrates, the Nile, the Indus and the Yellow River, villages grew into cities ruled by kings and priests. Writing was invented to keep accounts; bronze made better tools and weapons; and long-distance trade carried tin, copper and luxury goods between them.',
    heart: { name: 'Mesopotamia', at: [31.3, 45.6], note: '“The land between the rivers” — Sumer’s city-states, with the first writing and the first cities.' },
    hubs: [
      { name: 'Uruk & Ur', at: [31.32, 45.64], note: 'Sumer — perhaps the first true city, home to tens of thousands.' },
      { name: 'Giza & Memphis', at: [29.98, 31.13], note: 'Egypt — the pharaohs’ capital and the Great Pyramid.' },
      { name: 'Mohenjo-daro', at: [27.33, 68.14], note: 'Indus Valley — planned streets, drains and great baths.' },
      { name: 'Anyang', at: [36.1, 114.3], note: 'China — capital of the Shang dynasty, with the first Chinese writing on oracle bones.' },
      { name: 'Knossos', at: [35.3, 25.16], note: 'Crete — the palace of the seafaring Minoans.' },
      { name: 'Hattusa', at: [40.02, 34.62], note: 'Anatolia — capital of the Hittite empire.' },
    ],
    life: [
      'Most people farmed irrigated fields, giving part of the harvest as tax.',
      'In cities: bronze-smiths, potters, weavers, scribes, priests, soldiers and merchants.',
      'Kings and temples organised labour — to dig canals and build pyramids and ziggurats.',
    ],
    inventions: [
      { name: 'Writing', when: '~3200 BCE', emoji: '📜' },
      { name: 'Bronze', when: '~3300 BCE', emoji: '⚔️' },
      { name: 'The plough', when: '~3000 BCE', emoji: '🐂' },
      { name: 'Sailing ships', when: '~3000 BCE', emoji: '⛵' },
      { name: 'Written laws', when: '~1754 BCE', emoji: '⚖️' },
      { name: 'Chariots', when: '~2000 BCE', emoji: '🐎' },
      { name: 'The alphabet', when: '~1800 BCE', emoji: '🔤' },
    ],
    events: [
      { when: '~3100 BCE', text: 'Egypt is unified under the first pharaohs.' },
      { when: '~2560 BCE', text: 'The Great Pyramid of Giza is completed.' },
      { when: '~2334 BCE', text: 'Sargon of Akkad builds the first empire.' },
      { when: '~1754 BCE', text: 'Hammurabi of Babylon carves his code of laws in stone.' },
      { when: '~1600 BCE', text: 'The Shang dynasty rises in China.' },
      { when: '~1200 – 1150 BCE', text: 'The Late Bronze Age collapse: across the eastern Mediterranean, kingdoms fall.' },
    ],
    next: 'Around 1200 BCE, drought, earthquakes, raiders (the “Sea Peoples”) and the breakdown of trade toppled kingdom after kingdom. Without tin, bronze was scarce — but iron ore is found almost everywhere. Smiths learned to work it, and a new age began.',
    routes: [
      { name: 'Sea trade: Indus — Dilmun — Ur', points: [[22.52, 72.25], [22, 66], [24, 59], [26.4, 56.9], [26, 52], [26, 50.55], [29.5, 48.5], [30.96, 46.1]] },
      { name: 'Lapis lazuli from Afghanistan', points: [[36.7, 70.8], [34.5, 62], [33, 55], [32.5, 49], [30.96, 46.1]] },
      { name: 'Tin from Cornwall to the Mediterranean', points: [[50.1, -5.4], [47, -7], [43.5, -9.5], [37, -9.5], [36, -5.6], [37.5, 2], [38.5, 9], [37.5, 15], [35.5, 22], [35.3, 25.16]] },
    ],
    wiki: 'Bronze_Age',
  },
  {
    id: 'iron', name: 'Iron Age', emoji: '⚒️', span: 'c. 1200 – 500 BCE', lasted: 'about 700 years', color: '#94a3b8',
    tagline: 'Iron tools, alphabets and coins — and the first great empires',
    population: '≈ 100 million', pop: 1e8,
    summary: 'Cheap iron put strong tools and weapons into many more hands. Great empires — Assyria, Babylon, Persia — rose and fell; Phoenician sailors spread trade and the alphabet across the Mediterranean; and coins were invented. Toward the end came an astonishing burst of thought, from Greece to India and China.',
    heart: { name: 'The Near East', at: [33, 44], note: 'Assyria, Babylon and then Persia — the largest empires yet seen.' },
    hubs: [
      { name: 'Nineveh & Babylon', at: [34.5, 43.8], note: 'The Assyrian capital, then Babylon of Nebuchadnezzar and its fabled gardens.' },
      { name: 'Tyre', at: [33.27, 35.2], note: 'Phoenicia — merchant city whose ships reached the Atlantic.' },
      { name: 'Athens', at: [37.97, 23.73], note: 'Greece — city-states, colonies, theatre and philosophy.' },
      { name: 'Persepolis', at: [29.93, 52.89], note: 'Persia — ceremonial capital of the Achaemenid kings.' },
      { name: 'Ganges valley', at: [25.32, 83.0], note: 'India — the kingdoms of Magadha; the Buddha teaches here.' },
      { name: 'Luoyang', at: [34.62, 112.45], note: 'China — the Zhou kings’ capital; Confucius’ world.' },
      { name: 'Nok', at: [9.5, 8.0], note: 'Nigeria — iron-smelting and striking terracotta sculpture.' },
      { name: 'La Venta', at: [18.1, -94.04], note: 'Mexico — Olmec centre of colossal stone heads.' },
    ],
    life: [
      'Farmers with iron ploughs and sickles cleared and worked more land.',
      'Soldiers in standing armies; sailors and merchants on new sea routes.',
      'Many people in cities and empires now paid taxes — sometimes in coins.',
    ],
    inventions: [
      { name: 'Iron & steel', when: '~1200 BCE', emoji: '⚒️' },
      { name: 'Phoenician alphabet', when: '~1050 BCE', emoji: '🔤' },
      { name: 'Coins', when: '~600 BCE', emoji: '🪙' },
      { name: 'Triremes', when: '~700 BCE', emoji: '🚣' },
      { name: 'Qanats', when: '~800 BCE', emoji: '💧' },
      { name: 'Royal roads', when: '~500 BCE', emoji: '🛣️' },
    ],
    events: [
      { when: '814 BCE', text: 'Phoenicians found Carthage (traditional date).' },
      { when: '776 BCE', text: 'The first Olympic Games are held in Greece.' },
      { when: '753 BCE', text: 'Rome is founded — according to legend.' },
      { when: '586 BCE', text: 'Babylon conquers Jerusalem.' },
      { when: '550 BCE', text: 'Cyrus the Great founds the Persian Empire.' },
      { when: '6th century BCE', text: 'The “Axial Age”: the Buddha, Confucius, Laozi and the first Greek philosophers.' },
    ],
    next: 'New ideas — philosophy, democracy, world religions — and ever larger states came together in the great classical civilizations of Greece and Rome, Persia, India and China, linked for the first time by the Silk Road.',
    routes: [
      { name: 'Phoenician sea lanes', points: [[33.27, 35.2], [34.6, 33.5], [34.7, 30], [34.9, 25.5], [36.5, 20], [37.2, 15.5], [36.85, 10.33], [37.5, 5], [36.8, -1], [36.0, -5.6], [36.53, -6.29]] },
      { name: 'The Persian Royal Road', points: [[38.48, 28.04], [38.5, 33], [37, 38], [36, 43], [32.19, 48.25]] },
    ],
    wiki: 'Iron_Age',
  },
  {
    id: 'classical', name: 'Classical Antiquity', emoji: '🏛️', span: 'c. 500 BCE – 500 CE', lasted: 'about 1,000 years', color: '#e879f9',
    tagline: 'Rome, Persia, the Mauryas and the Han — linked by the Silk Road',
    population: '≈ 200 million', pop: 2e8,
    summary: 'A handful of vast empires ruled most of humanity: Rome around the Mediterranean, Persia, India’s Mauryas and Guptas, and Han China. Ideas that still shape the world took form — Greek philosophy and democracy, Roman law, Buddhism, Christianity, Confucian government — and the Silk Road carried goods, faiths and diseases across Eurasia.',
    heart: { name: 'Han China & India', at: [28, 95], note: 'Most of humanity lived in Asia: Han China and India each had around a quarter of the world’s people.' },
    share: { asia: 68, europe: 18, africa: 10, americas: 3, oceania: 1, year: '1 CE' },
    hubs: [
      { name: 'Rome', at: [41.9, 12.5], note: 'Perhaps a million people by the 1st century — the largest city in the west.' },
      { name: 'Athens', at: [37.97, 23.73], note: 'Birthplace of democracy (508 BCE), Socrates, Plato and Aristotle.' },
      { name: 'Alexandria', at: [31.2, 29.92], note: 'Egypt — the great Library and the lighthouse of Pharos.' },
      { name: 'Ctesiphon', at: [33.09, 44.58], note: 'Capital of the Parthian and Sasanian Persian empires.' },
      { name: 'Pataliputra', at: [25.6, 85.1], note: 'India — capital of the Maurya emperor Ashoka.' },
      { name: 'Chang’an', at: [34.27, 108.94], note: 'China — capital of the Han, eastern end of the Silk Road.' },
      { name: 'Aksum', at: [14.13, 38.72], note: 'Ethiopia — a trading empire with towering stone stelae.' },
      { name: 'Teotihuacan', at: [19.69, -98.84], note: 'Mexico — a planned city of 100,000 and the Pyramid of the Sun.' },
    ],
    life: [
      'Still mostly farming — on estates worked by tenants, peasants and, in Rome, enslaved people.',
      'Soldiers of huge professional armies; officials and tax collectors.',
      'Merchants moving silk, spices, glass and silver along roads and sea lanes.',
    ],
    inventions: [
      { name: 'Democracy', when: '508 BCE', emoji: '🗳️' },
      { name: 'Paper', when: '~100 CE', emoji: '📄' },
      { name: 'Concrete & arches', when: '~200 BCE', emoji: '🏛️' },
      { name: 'Aqueducts', when: '312 BCE', emoji: '🌉' },
      { name: 'Antikythera mechanism', when: '~100 BCE', emoji: '⚙️' },
      { name: 'Seismoscope', when: '132 CE', emoji: '🐉' },
      { name: 'Zero as a number', when: 'by ~500 CE', emoji: '0️⃣' },
    ],
    events: [
      { when: '334 – 323 BCE', text: 'Alexander the Great conquers from Greece to India.' },
      { when: '~260 BCE', text: 'Ashoka turns to Buddhism after the bloody conquest of Kalinga.' },
      { when: '221 BCE', text: 'Qin Shi Huang unites China; work on the Great Wall.' },
      { when: '~130 BCE', text: 'The Han open the Silk Road to the west.' },
      { when: '27 BCE', text: 'Augustus becomes the first Roman emperor.' },
      { when: '476 CE', text: 'The last western Roman emperor is deposed.' },
    ],
    next: 'Plagues, a cooling climate, migrations and invasions broke the great empires: Han China split in 220 CE and the western Roman Empire fell in 476. In their place came new kingdoms, faiths and centres of learning — the Middle Ages.',
    routes: [
      { name: 'The Silk Road', points: [[34.27, 108.94], [36.06, 103.83], [40.14, 94.66], [39.47, 75.99], [39.65, 66.96], [37.66, 62.19], [35.5, 52], [33.09, 44.58], [34.55, 38.27], [36.2, 36.16], [35.5, 30], [35, 20], [38.2, 15.6], [40.8, 13.5], [41.75, 12.3]] },
      { name: 'The spice route to India', points: [[31.2, 29.92], [30, 31.3], [23.9, 35.47], [15, 41.5], [12.6, 43.4], [12, 50], [10, 65], [10.15, 76.2]] },
    ],
    wiki: 'Classical_antiquity',
  },
  {
    id: 'medieval', name: 'The Middle Ages', emoji: '🏰', span: 'c. 500 – 1500 CE', lasted: 'about 1,000 years', color: '#60a5fa',
    tagline: 'Castles and caliphates, the Tang and Song, Mali and the Mongols',
    population: '≈ 450 million', pop: 4.5e8,
    summary: 'While western Europe was a patchwork of kingdoms, the world’s great cities lay elsewhere: Constantinople, Baghdad in the Islamic Golden Age, Tang and Song China, Angkor, and Tenochtitlan. The Mongols built the largest land empire in history — and the Black Death travelled along its roads.',
    heart: { name: 'Song China', at: [32, 114], note: 'Around 1100, Song China held perhaps 100 million people — a quarter of humanity — with the world’s biggest cities and economy.' },
    share: { asia: 68, europe: 14, africa: 13, americas: 4, oceania: 1, year: '1000 CE' },
    hubs: [
      { name: 'Constantinople', at: [41.01, 28.98], note: 'Capital of the Byzantine Empire for a thousand years.' },
      { name: 'Baghdad', at: [33.31, 44.36], note: 'The Abbasid caliphs’ capital and its House of Wisdom.' },
      { name: 'Córdoba', at: [37.88, -4.78], note: 'Al-Andalus — perhaps western Europe’s largest city around 1000.' },
      { name: 'Kaifeng & Hangzhou', at: [32, 117], note: 'Song China — cities of a million, paper money and printed books.' },
      { name: 'Angkor', at: [13.41, 103.87], note: 'Cambodia — the Khmer capital and Angkor Wat.' },
      { name: 'Timbuktu', at: [16.77, -3.0], note: 'Mali Empire — gold, salt, books and scholars.' },
      { name: 'Great Zimbabwe', at: [-20.27, 30.93], note: 'Southern Africa — a stone city at the heart of the gold trade.' },
      { name: 'Cahokia', at: [38.66, -90.06], note: 'North America — the largest city north of Mexico, around 1100.' },
      { name: 'Tenochtitlan', at: [19.43, -99.13], note: 'The Aztec island-capital, founded 1325 — bigger than any city in Spain.' },
      { name: 'Cusco', at: [-13.52, -71.97], note: 'Capital of the Inca, the largest empire in the Americas.' },
    ],
    life: [
      'Most people were peasants working the land — in Europe, often bound to a lord.',
      'Craftsmen organised in guilds; merchants trading by caravan and ship.',
      'Monks, imams and scholars kept learning alive in monasteries, madrasas and academies.',
    ],
    inventions: [
      { name: 'Gunpowder', when: '~850', emoji: '💥' },
      { name: 'Printing', when: 'woodblock ~700; movable type ~1040', emoji: '📖' },
      { name: 'Magnetic compass', when: '~1050', emoji: '🧭' },
      { name: 'Algebra', when: '~820', emoji: '➗' },
      { name: 'Paper money', when: '~1020', emoji: '💴' },
      { name: 'Mechanical clocks', when: '~1300', emoji: '🕰️' },
      { name: 'Eyeglasses', when: '~1286', emoji: '👓' },
      { name: 'Printing press', when: '~1440', emoji: '🖨️' },
    ],
    events: [
      { when: '610 – 632', text: 'The rise of Islam; within a century, the caliphate stretches from Spain to India.' },
      { when: '800', text: 'Charlemagne is crowned emperor in Rome.' },
      { when: '1096 – 1291', text: 'The Crusades.' },
      { when: '1206', text: 'Genghis Khan unites the Mongols; their empire soon spans Asia.' },
      { when: '1324', text: 'Mansa Musa of Mali makes his famously golden pilgrimage to Mecca.' },
      { when: '1347 – 1351', text: 'The Black Death kills perhaps a third of Europe.' },
      { when: '1453', text: 'Constantinople falls to the Ottomans.' },
    ],
    next: 'Printing spread ideas faster than ever; the Renaissance revived ancient learning; and in the 1490s Columbus and da Gama opened ocean routes to the Americas and Asia — beginning an age when the whole world would be connected. (See Famous voyages.)',
    routes: [
      { name: 'Indian Ocean trade', points: [[-8.96, 39.6], [-4, 40.2], [2, 45.5], [11.8, 51.5], [12.5, 45.5], [12.6, 43.4], [13, 52], [11.25, 75.75], [7.6, 76.8], [6, 80.2], [6.2, 94.5], [4, 99.6], [2.19, 102.25], [1.25, 103.8], [10, 109.5], [20, 114], [24.87, 118.68]] },
      { name: 'Gold and salt across the Sahara', points: [[16.77, -3.0], [23.6, -5], [31.28, -4.27], [34.03, -5.0]] },
      { name: 'The Mongol Silk Road', points: [[39.9, 116.4], [41, 108], [40.14, 94.66], [43.8, 87.6], [43.25, 76.9], [39.65, 66.96], [41.3, 60], [46.35, 48.05], [45.3, 36.5], [41.01, 28.98]] },
    ],
    wiki: 'Post-classical_history',
  },
  {
    id: 'early-modern', name: 'Early Modern Era', emoji: '🧭', span: '1500 – 1760', lasted: 'about 260 years', color: '#f472b6',
    tagline: 'Oceans, empires and the Scientific Revolution — the world connected',
    population: '≈ 770 million', pop: 7.7e8,
    summary: 'European ships linked every ocean. Crops, animals, silver and diseases crossed between the hemispheres in the “Columbian Exchange” — devastating the peoples of the Americas — and the Atlantic slave trade forced millions of Africans across the sea. Meanwhile the Ming and Qing, Mughals and Ottomans ruled vast, rich empires, and science was transformed.',
    heart: { name: 'Mughal India & Qing China', at: [27, 95], note: 'Around 1700, the Mughal and Qing empires together held about half of all people on Earth.' },
    share: { asia: 66, europe: 20, africa: 11, americas: 2, oceania: 1, year: '1700' },
    hubs: [
      { name: 'Beijing', at: [39.9, 116.4], note: 'Capital of the Ming and Qing — perhaps the world’s largest city.' },
      { name: 'Agra & Delhi', at: [27.18, 78.0], note: 'Mughal capitals — the Taj Mahal is built 1632–1653.' },
      { name: 'Istanbul', at: [41.01, 28.98], note: 'The Ottoman capital, ruling from Hungary to Arabia.' },
      { name: 'Isfahan', at: [32.65, 51.67], note: 'Safavid Persia — “Isfahan is half the world”.' },
      { name: 'Edo (Tokyo)', at: [35.68, 139.76], note: 'Japan under the Tokugawa — a city of a million by 1720.' },
      { name: 'Amsterdam & London', at: [52.0, 2.5], note: 'Centres of global trade, banking and the first stock exchange.' },
      { name: 'Potosí', at: [-19.59, -65.75], note: 'Bolivia — a silver mountain that funded empires, mined by forced Indigenous labour.' },
      { name: 'Mexico City', at: [19.43, -99.13], note: 'Built on the ruins of Tenochtitlan — capital of New Spain.' },
    ],
    life: [
      'Most people still farmed — now with new crops from across the ocean: maize, potatoes, chillies.',
      'Millions of enslaved Africans worked plantations of sugar, tobacco and cotton in the Americas.',
      'Sailors, merchants and bankers drove a new global trade; printing spread literacy.',
    ],
    inventions: [
      { name: 'Telescope', when: '1608', emoji: '🔭' },
      { name: 'Microscope', when: '~1600', emoji: '🔬' },
      { name: 'Pendulum clock', when: '1656', emoji: '🕰️' },
      { name: 'Stock exchange', when: '1602', emoji: '📈' },
      { name: 'Newspapers', when: '1605', emoji: '📰' },
      { name: 'Laws of motion & gravity', when: '1687', emoji: '🍎' },
      { name: 'Steam pump', when: '1712', emoji: '💨' },
    ],
    events: [
      { when: '1492 – 1498', text: 'Columbus reaches the Americas; da Gama sails to India.' },
      { when: '1517', text: 'Luther’s 95 Theses start the Protestant Reformation.' },
      { when: '1521 – 1533', text: 'Spain conquers the Aztec and Inca empires.' },
      { when: '1500s – 1860s', text: 'The Atlantic slave trade carries about 12.5 million Africans to the Americas.' },
      { when: '1543 – 1687', text: 'The Scientific Revolution: from Copernicus to Newton.' },
      { when: '1644', text: 'The Qing dynasty takes Beijing.' },
    ],
    next: 'In 18th-century Britain, cheap coal, new machines for spinning cotton and James Watt’s improved steam engine moved work from homes to factories. The Industrial Revolution would change daily life more than anything since farming.',
    routes: [
      { name: 'The Atlantic slave trade', points: [[53.4, -3.2], [45, -12], [30, -18], [15, -18.5], [6.0, 2.1], [0, -15], [10, -45], [18, -75], [25, -78], [35, -60], [45, -30], [51, -10], [53.4, -3.2]] },
      { name: 'The Manila galleons', points: [[16.85, -99.9], [13, -150], [13.5, 145], [14.6, 120.98]] },
    ],
    wiki: 'Early_modern_period',
  },
  {
    id: 'industrial', name: 'Industrial Age', emoji: '🏭', span: '1760 – 1945', lasted: 'about 185 years', color: '#fb7185',
    tagline: 'Steam, railways, electricity — and two world wars',
    population: '≈ 2.3 billion', pop: 2.3e9,
    summary: 'Machines powered by coal, then oil and electricity, multiplied what people could make and how far they could travel. Cities swelled; railways, steamships and telegraphs shrank the world; medicine began to defeat old diseases. Europe’s industrial power let it colonise most of Africa and much of Asia — until two world wars shook the old order apart.',
    heart: { name: 'Britain & Europe', at: [52, 0], note: 'Asia still had the most people, but industrial Europe — led by Britain — dominated the world economy.' },
    share: { asia: 57, europe: 25, africa: 8, americas: 10, oceania: 0, year: '1900' },
    hubs: [
      { name: 'Manchester', at: [53.48, -2.24], note: '“Cottonopolis” — the first industrial city.' },
      { name: 'London', at: [51.51, -0.13], note: 'The world’s largest city in 1900 and the hub of the British Empire.' },
      { name: 'The Ruhr', at: [51.46, 7.01], note: 'Germany — coal, steel and the Krupp works.' },
      { name: 'New York', at: [40.71, -74.0], note: 'Gateway for millions of immigrants.' },
      { name: 'Chicago', at: [41.88, -87.63], note: 'Railways, stockyards and the first skyscrapers.' },
      { name: 'Tokyo', at: [35.68, 139.76], note: 'Meiji Japan industrialises at astonishing speed.' },
      { name: 'Shanghai', at: [31.23, 121.47], note: 'China’s great treaty port and industrial city.' },
      { name: 'Bombay (Mumbai)', at: [18.95, 72.83], note: 'Cotton mills and the busiest port of British India.' },
    ],
    life: [
      'Millions moved from farms to factories, mills and mines — long hours, often for children too.',
      'Railways and steamships carried people, letters and goods across continents.',
      'By 1945 many people had electric light, newspapers, radio — and the vote.',
    ],
    inventions: [
      { name: 'Steam engine', when: '1776 (Watt)', emoji: '🚂' },
      { name: 'Vaccination', when: '1796', emoji: '💉' },
      { name: 'Railways', when: '1825', emoji: '🛤️' },
      { name: 'Telegraph', when: '1837', emoji: '📡' },
      { name: 'Telephone', when: '1876', emoji: '☎️' },
      { name: 'Electric light', when: '1879', emoji: '💡' },
      { name: 'Motor car', when: '1886', emoji: '🚗' },
      { name: 'Aeroplane', when: '1903', emoji: '✈️' },
      { name: 'Penicillin', when: '1928', emoji: '💊' },
    ],
    events: [
      { when: '1776 & 1789', text: 'The American and French Revolutions.' },
      { when: '1833 – 1888', text: 'Slavery is abolished across the British Empire, the US and Brazil.' },
      { when: '1869', text: 'The Suez Canal opens.' },
      { when: '1884 – 1914', text: 'The “Scramble for Africa”: European powers colonise almost the whole continent.' },
      { when: '1914 – 1918', text: 'The First World War; then the 1918 flu pandemic.' },
      { when: '1939 – 1945', text: 'The Second World War — the deadliest conflict in history — ends with atomic bombs.' },
    ],
    next: 'After 1945, the United Nations was founded, empires gave way to independent nations, and the transistor and computer launched a new revolution — not of steam, but of information.',
    routes: [
      { name: 'Steamships via the Suez Canal', points: [[51.5, 1.2], [49.6, -5.5], [43, -10], [36, -6], [37, 2], [37, 10.5], [33.5, 25], [31.26, 32.3], [29.97, 32.55], [20, 38.5], [12.6, 43.4], [14, 55], [18.95, 72.83]] },
      { name: 'Across the Atlantic to a new life', points: [[53.4, -3.2], [52, -12], [48, -35], [43, -60], [40.6, -73.9]] },
    ],
    wiki: 'Industrial_Revolution',
  },
  {
    id: 'information', name: 'Information Age', emoji: '💻', span: '1945 – today', lasted: 'about 80 years — so far', color: '#38bdf8',
    tagline: 'Computers, the Moon, the internet — and eight billion of us',
    population: '≈ 8.1 billion', pop: 8.1e9,
    summary: 'In one lifetime the world population more than tripled. Computers, satellites and the internet connected nearly everyone; most people now live in cities; life expectancy soared. The same power brought new challenges: nuclear weapons, a warming climate, and questions about the machines we are building.',
    heart: { name: 'South & East Asia', at: [25, 95], note: 'About six in ten people live in Asia. India passed China as the most populous country in 2023.' },
    share: { asia: 59, europe: 9, africa: 18, americas: 13, oceania: 1, year: '2024' },
    hubs: [
      { name: 'Tokyo', at: [35.68, 139.76], note: 'The world’s largest metropolitan area — about 37 million people.' },
      { name: 'Delhi', at: [28.61, 77.21], note: 'Growing toward becoming the largest city on Earth.' },
      { name: 'Shanghai & Shenzhen', at: [27, 118], note: 'Manufacturing powerhouses of modern China.' },
      { name: 'Lagos', at: [6.52, 3.38], note: 'Africa’s biggest city — Africa is the fastest-growing continent.' },
      { name: 'Cairo', at: [30.04, 31.24], note: 'The largest city in the Arab world.' },
      { name: 'São Paulo', at: [-23.55, -46.63], note: 'South America’s largest city.' },
      { name: 'New York', at: [40.71, -74.0], note: 'Finance, media and the UN headquarters.' },
      { name: 'Silicon Valley', at: [37.39, -122.08], note: 'Birthplace of the microchip and many internet giants.' },
    ],
    life: [
      'Most people work in services — offices, shops, transport, health, teaching, software.',
      'Over half of humanity lives in cities (since 2007); farming employs about a quarter of workers.',
      'Billions carry a computer in their pocket, connected to almost all human knowledge.',
    ],
    inventions: [
      { name: 'Transistor', when: '1947', emoji: '🔌' },
      { name: 'Satellites', when: '1957', emoji: '🛰️' },
      { name: 'Internet', when: '1969 – 1983', emoji: '🌐' },
      { name: 'World Wide Web', when: '1991', emoji: '🕸️' },
      { name: 'GPS', when: '1995', emoji: '📍' },
      { name: 'Smartphone', when: '2007', emoji: '📱' },
      { name: 'Human genome', when: '2003', emoji: '🧬' },
      { name: 'AI', when: '2020s', emoji: '🤖' },
    ],
    events: [
      { when: '1945', text: 'The United Nations is founded.' },
      { when: '1947 – 1975', text: 'Decolonisation: India, then most of Africa and Asia, become independent.' },
      { when: '1969', text: 'Humans walk on the Moon.' },
      { when: '1989 – 1991', text: 'The Berlin Wall falls and the Cold War ends.' },
      { when: '2020', text: 'The COVID-19 pandemic.' },
      { when: '2022', text: 'The world population passes 8 billion.' },
    ],
    next: 'What comes next is being written now — by how we meet a changing climate, power our lives, use artificial intelligence and perhaps, one day, live beyond the Earth.',
    routes: [
      { name: 'Undersea internet cables: Europe — Asia', points: [[43.3, 5.37], [37.5, 11], [33.5, 25], [31.26, 32.3], [29.97, 32.55], [20, 38.5], [12.6, 43.4], [14, 55], [18.95, 72.8], [6, 79.5], [6.2, 94.5], [4, 99.6], [1.25, 103.8], [10, 111], [22.3, 114.2]] },
      { name: 'Across the Atlantic', points: [[40.6, -73.9], [45, -45], [50.83, -4.55]] },
      { name: 'Across the Pacific', points: [[33.7, -118.3], [21.3, -157.9], [13.5, 145], [35, 139.9]] },
    ],
    wiki: 'Information_Age',
  },
];

export const BY_ERA = new Map(ERAS.map((e) => [e.id, e]));

const rad = (d: number) => (d * Math.PI) / 180;
const km = ([a1, o1]: LL, [a2, o2]: LL) => {
  const h = Math.sin(rad(a2 - a1) / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(rad(o2 - o1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};
/** The camera for an era: centred on its heart, far enough out to show its centres. */
export function eraView(e: Era) {
  const [lat, lng] = e.heart.at;
  const spread = Math.max(...e.hubs.map((h) => km(e.heart.at, h.at))) / 111;
  return { lat, lng, altitude: Math.min(3.2, Math.max(1.1, 0.5 + spread / 30)) };
}
