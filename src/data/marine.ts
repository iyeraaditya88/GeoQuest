// The sea's landmarks: straits (and the great canals and passages) — the world's chokepoints — and
// the deep ocean trenches. Hand-picked, with a line worth remembering about each.
// a = [lng, lat] (for trenches: the deepest point). r = importance: 1 shows first, from far out;
// 3 only when you're zoomed in. Depths are approximate (surveys differ by tens of metres).

export type StraitKind = 'strait' | 'canal' | 'passage' | 'channel';
export interface Strait { n: string; a: [number, number]; r: 1 | 2 | 3; type: StraitKind; joins: string; fact: string }
export interface Trench { n: string; a: [number, number]; r: 1 | 2 | 3; depth: number; deep?: string; ocean: string; fact: string }

export const STRAITS: Strait[] = [
  // ── The great chokepoints ──
  { n: 'Strait of Gibraltar', a: [-5.6, 35.95], r: 1, type: 'strait', joins: 'Atlantic Ocean ↔ Mediterranean Sea', fact: 'Europe and Africa are only 14 km apart here.' },
  { n: 'Strait of Hormuz', a: [56.35, 26.55], r: 1, type: 'strait', joins: 'Persian Gulf ↔ Gulf of Oman', fact: 'About a fifth of the world’s oil passes through it.' },
  { n: 'Strait of Malacca', a: [100.6, 3.0], r: 1, type: 'strait', joins: 'Andaman Sea ↔ South China Sea', fact: 'One of the world’s busiest shipping lanes, between Malaysia and Sumatra.' },
  { n: 'Bab-el-Mandeb', a: [43.4, 12.6], r: 1, type: 'strait', joins: 'Red Sea ↔ Gulf of Aden', fact: 'Its name means “Gate of Grief”; it links the Suez route to the Indian Ocean.' },
  { n: 'Bosporus', a: [29.05, 41.12], r: 1, type: 'strait', joins: 'Black Sea ↔ Sea of Marmara', fact: 'It runs through Istanbul, dividing Europe from Asia.' },
  { n: 'Bering Strait', a: [-168.95, 65.75], r: 1, type: 'strait', joins: 'Pacific Ocean ↔ Arctic Ocean', fact: 'Russia and the USA are about 82 km apart here.' },
  { n: 'Suez Canal', a: [32.35, 30.6], r: 1, type: 'canal', joins: 'Mediterranean Sea ↔ Red Sea', fact: 'Opened in 1869, it saves ships the long trip around Africa.' },
  { n: 'Panama Canal', a: [-79.7, 9.15], r: 1, type: 'canal', joins: 'Atlantic Ocean ↔ Pacific Ocean', fact: 'Opened in 1914; locks lift ships about 26 m over the isthmus.' },
  { n: 'Drake Passage', a: [-65.0, -58.5], r: 1, type: 'passage', joins: 'Atlantic Ocean ↔ Pacific Ocean', fact: 'Between Cape Horn and Antarctica — some of the roughest seas on Earth.' },
  // ── Important straits ──
  { n: 'Strait of Dover', a: [1.45, 51.0], r: 2, type: 'strait', joins: 'English Channel ↔ North Sea', fact: 'One of the world’s busiest sea lanes; about 33 km wide.' },
  { n: 'Dardanelles', a: [26.4, 40.2], r: 2, type: 'strait', joins: 'Sea of Marmara ↔ Aegean Sea', fact: 'Scene of the Gallipoli campaign of 1915.' },
  { n: 'Taiwan Strait', a: [119.5, 24.3], r: 2, type: 'strait', joins: 'East China Sea ↔ South China Sea', fact: 'About 130 km wide, between Taiwan and mainland China.' },
  { n: 'Korea Strait', a: [129.0, 34.3], r: 2, type: 'strait', joins: 'Sea of Japan ↔ East China Sea', fact: 'Between South Korea and Japan.' },
  { n: 'Mozambique Channel', a: [41.0, -18.0], r: 2, type: 'channel', joins: 'Indian Ocean', fact: 'Separates Madagascar from mainland Africa.' },
  { n: 'Strait of Magellan', a: [-70.9, -53.3], r: 2, type: 'strait', joins: 'Atlantic Ocean ↔ Pacific Ocean', fact: 'Named after Ferdinand Magellan, who sailed it in 1520.' },
  { n: 'Straits of Florida', a: [-80.5, 24.0], r: 2, type: 'strait', joins: 'Gulf of Mexico ↔ Atlantic Ocean', fact: 'Between Florida and Cuba; the Gulf Stream flows through it.' },
  { n: 'Sunda Strait', a: [105.8, -6.0], r: 2, type: 'strait', joins: 'Java Sea ↔ Indian Ocean', fact: 'Between Java and Sumatra — home of the Krakatoa volcano.' },
  { n: 'Lombok Strait', a: [115.75, -8.75], r: 2, type: 'strait', joins: 'Bali Sea ↔ Indian Ocean', fact: 'Part of the Wallace Line, where Asian and Australian wildlife meet.' },
  { n: 'Palk Strait', a: [79.6, 10.0], r: 2, type: 'strait', joins: 'Bay of Bengal ↔ Palk Bay', fact: 'Between India and Sri Lanka, beside the shoals of Adam’s Bridge.' },
  { n: 'Torres Strait', a: [142.3, -10.2], r: 2, type: 'strait', joins: 'Arafura Sea ↔ Coral Sea', fact: 'Between Australia and New Guinea, dotted with over 270 islands.' },
  { n: 'Bass Strait', a: [146.0, -39.6], r: 2, type: 'strait', joins: 'Tasman Sea ↔ Indian Ocean', fact: 'Separates Tasmania from mainland Australia.' },
  { n: 'Cook Strait', a: [174.4, -41.3], r: 2, type: 'strait', joins: 'Tasman Sea ↔ Pacific Ocean', fact: 'Between New Zealand’s North and South Islands.' },
  { n: 'Strait of Messina', a: [15.63, 38.2], r: 2, type: 'strait', joins: 'Tyrrhenian Sea ↔ Ionian Sea', fact: 'Between Sicily and mainland Italy — about 3 km at its narrowest.' },
  { n: 'Denmark Strait', a: [-27.0, 66.5], r: 2, type: 'strait', joins: 'Greenland Sea ↔ Atlantic Ocean', fact: 'Between Greenland and Iceland; it hides the world’s largest underwater waterfall.' },
  { n: 'Davis Strait', a: [-57.0, 66.0], r: 2, type: 'strait', joins: 'Baffin Bay ↔ Labrador Sea', fact: 'Between Greenland and Canada’s Baffin Island.' },
  { n: 'Luzon Strait', a: [121.0, 20.5], r: 2, type: 'strait', joins: 'Philippine Sea ↔ South China Sea', fact: 'Between Taiwan and the Philippines.' },
  // ── Regional ──
  { n: 'Strait of Otranto', a: [18.9, 40.2], r: 3, type: 'strait', joins: 'Adriatic Sea ↔ Ionian Sea', fact: 'Between Italy and Albania.' },
  { n: 'Kerch Strait', a: [36.55, 45.3], r: 3, type: 'strait', joins: 'Black Sea ↔ Sea of Azov', fact: 'Between Crimea and Russia’s Taman Peninsula.' },
  { n: 'Hudson Strait', a: [-70.0, 62.3], r: 3, type: 'strait', joins: 'Atlantic Ocean ↔ Hudson Bay', fact: 'The gateway to Hudson Bay, between Baffin Island and Quebec.' },
  { n: 'Tsugaru Strait', a: [140.6, 41.5], r: 3, type: 'strait', joins: 'Sea of Japan ↔ Pacific Ocean', fact: 'Between Honshu and Hokkaido — the Seikan rail tunnel runs beneath it.' },
  { n: 'La Pérouse Strait', a: [142.0, 45.7], r: 3, type: 'strait', joins: 'Sea of Japan ↔ Sea of Okhotsk', fact: 'Between Sakhalin and Hokkaido.' },
  { n: 'Strait of Juan de Fuca', a: [-123.9, 48.3], r: 3, type: 'strait', joins: 'Salish Sea ↔ Pacific Ocean', fact: 'Part of the border between the USA and Canada.' },
  { n: 'Strait of Bonifacio', a: [9.2, 41.3], r: 3, type: 'strait', joins: 'Tyrrhenian Sea ↔ Mediterranean Sea', fact: 'Between Corsica and Sardinia.' },
  { n: 'Øresund', a: [12.7, 55.9], r: 3, type: 'strait', joins: 'Baltic Sea ↔ Kattegat', fact: 'Between Denmark and Sweden, crossed by the Øresund Bridge.' },
  { n: 'Makassar Strait', a: [118.5, -1.5], r: 3, type: 'strait', joins: 'Celebes Sea ↔ Java Sea', fact: 'Between Borneo and Sulawesi.' },
  { n: 'Singapore Strait', a: [104.0, 1.2], r: 3, type: 'strait', joins: 'Strait of Malacca ↔ South China Sea', fact: 'Past Singapore, one of the world’s busiest ports.' },
];

export const TRENCHES: Trench[] = [
  { n: 'Mariana Trench', a: [142.2, 11.35], r: 1, depth: 10935, deep: 'Challenger Deep', ocean: 'Pacific Ocean', fact: 'The deepest place in any ocean — Mount Everest would fit inside with over 2 km to spare.' },
  { n: 'Tonga Trench', a: [-174.73, -23.26], r: 1, depth: 10800, deep: 'Horizon Deep', ocean: 'Pacific Ocean', fact: 'The second-deepest trench, and one of the fastest-moving plate boundaries.' },
  { n: 'Philippine Trench', a: [126.6, 10.0], r: 1, depth: 10540, deep: 'Emden Deep', ocean: 'Pacific Ocean', fact: 'Runs along the east of the Philippines for about 1,300 km.' },
  { n: 'Kermadec Trench', a: [-177.4, -31.9], r: 2, depth: 10047, ocean: 'Pacific Ocean', fact: 'Continues the Tonga Trench south towards New Zealand.' },
  { n: 'Izu–Ogasawara Trench', a: [142.6, 29.2], r: 2, depth: 9780, ocean: 'Pacific Ocean', fact: 'South of Japan, joining the Japan and Mariana trenches.' },
  { n: 'Kuril–Kamchatka Trench', a: [150.5, 44.1], r: 2, depth: 9600, ocean: 'Pacific Ocean', fact: 'Along the Kuril Islands and Kamchatka, in Russia’s far east.' },
  { n: 'Japan Trench', a: [144.0, 37.5], r: 2, depth: 8412, ocean: 'Pacific Ocean', fact: 'Source of the 2011 Tōhoku earthquake and tsunami.' },
  { n: 'Puerto Rico Trench', a: [-66.9, 19.8], r: 1, depth: 8376, deep: 'Milwaukee Deep', ocean: 'Atlantic Ocean', fact: 'The deepest point of the Atlantic Ocean.' },
  { n: 'South Sandwich Trench', a: [-26.3, -55.4], r: 2, depth: 8265, deep: 'Meteor Deep', ocean: 'Atlantic / Southern Ocean', fact: 'A curving trench near the South Sandwich Islands, close to Antarctica.' },
  { n: 'Peru–Chile Trench', a: [-71.4, -23.4], r: 1, depth: 8065, deep: 'Richards Deep', ocean: 'Pacific Ocean', fact: 'Also called the Atacama Trench — about 5,900 km long, one of the longest.' },
  { n: 'Aleutian Trench', a: [-177.0, 51.0], r: 2, depth: 7679, ocean: 'Pacific Ocean', fact: 'Curves along the Aleutian Islands from Alaska towards Kamchatka.' },
  { n: 'Cayman Trough', a: [-80.5, 19.2], r: 3, depth: 7686, ocean: 'Caribbean Sea', fact: 'The deepest point of the Caribbean, between Cuba and Jamaica.' },
  { n: 'Sunda Trench', a: [110.0, -10.3], r: 1, depth: 7290, ocean: 'Indian Ocean', fact: 'Also called the Java Trench — the deepest point of the Indian Ocean.' },
  { n: 'Middle America Trench', a: [-96.0, 14.5], r: 3, depth: 6669, ocean: 'Pacific Ocean', fact: 'Along the Pacific coast of Mexico and Central America.' },
];
