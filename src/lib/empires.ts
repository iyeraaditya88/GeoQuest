// Empires of the world: when each rose and fell, its extent at its height (as the modern countries
// that lay mostly within it — an approximation, since borders then weren't today's), its capital and
// key places, rulers, achievements, events and how it ended. Figures are rounded scholarly estimates.
import { BY_CCA3 } from './data';

export type LL = [number, number];
export interface Place { name: string; at: LL; note: string }
export interface Empire {
  id: string;
  name: string;
  emoji: string;
  from: number;          // year (negative = BCE)
  to: number;
  span: string;
  peak: string;          // when it was at its height
  color: string;
  tagline: string;
  summary: string;
  area: string;
  population: string;
  capital: Place;
  places: Place[];
  rulers: { name: string; when: string; note: string }[];
  achievements: string[];
  events: { when: string; text: string }[];
  fall: string;
  countries: string[];   // cca3 of today's countries mostly within it at its height
  mapNote?: string;
  focus?: LL;            // camera centre for empires that span the world
  wiki: string;
}

const LIST: Empire[] = [
  {
    id: 'egypt', name: 'Egypt’s New Kingdom', emoji: '☀️', from: -1550, to: -1069, span: 'c. 1550 – 1069 BCE', peak: 'c. 1450 BCE, under Thutmose III', color: '#facc15',
    tagline: 'The age of the great pharaohs — Hatshepsut, Akhenaten, Tutankhamun, Ramesses',
    summary: 'After driving out the Hyksos invaders, Egypt’s pharaohs built an empire from Nubia to Syria. It was the age of the Valley of the Kings, the temples of Karnak and Abu Simbel, and some of history’s most famous rulers.',
    area: '≈ 1 million km²', population: '≈ 3–5 million',
    capital: { name: 'Thebes (Luxor)', at: [25.7, 32.64], note: 'Religious capital — the temples of Karnak and Luxor, and the royal tombs across the Nile.' },
    places: [
      { name: 'Memphis', at: [29.85, 31.25], note: 'The ancient capital near Giza and the pyramids.' },
      { name: 'Amarna', at: [27.65, 30.9], note: 'Akhenaten’s new city, built for his single god, the Aten.' },
      { name: 'Abu Simbel', at: [22.34, 31.63], note: 'Ramesses II’s giant rock temples on the Nubian frontier.' },
      { name: 'Megiddo', at: [32.58, 35.18], note: 'Thutmose III’s great victory in Canaan, 1457 BCE.' },
      { name: 'Kadesh', at: [34.56, 36.52], note: 'Ramesses II fights the Hittites, 1274 BCE.' },
    ],
    rulers: [
      { name: 'Hatshepsut', when: '1479 – 1458 BCE', note: 'A woman who ruled as pharaoh; sent a famous trading expedition to the land of Punt.' },
      { name: 'Thutmose III', when: '1479 – 1425 BCE', note: 'Seventeen campaigns took Egypt’s borders to their widest.' },
      { name: 'Akhenaten', when: '1353 – 1336 BCE', note: 'Replaced Egypt’s many gods with one, the sun-disc Aten.' },
      { name: 'Tutankhamun', when: '1332 – 1323 BCE', note: 'A boy king — famous because his tomb was found almost intact in 1922.' },
      { name: 'Ramesses II', when: '1279 – 1213 BCE', note: '“The Great”: builder, warrior, and father of over 100 children.' },
    ],
    achievements: [
      'The Valley of the Kings, and the temples of Karnak, Luxor and Abu Simbel.',
      'The first known peace treaty, with the Hittites (c. 1259 BCE).',
      'Advances in medicine, astronomy and a 365-day calendar.',
    ],
    events: [
      { when: '1550 BCE', text: 'Ahmose I expels the Hyksos and reunites Egypt.' },
      { when: '1457 BCE', text: 'Thutmose III wins at Megiddo.' },
      { when: '1274 BCE', text: 'The Battle of Kadesh against the Hittites.' },
      { when: '1259 BCE', text: 'Egypt and the Hittites sign a peace treaty.' },
      { when: '1177 BCE', text: 'Ramesses III repels the “Sea Peoples”.' },
    ],
    fall: 'In the Late Bronze Age collapse, trade withered and raids, droughts and corruption weakened the pharaohs. By 1069 BCE Egypt was split between kings in the north and the priests of Amun at Thebes.',
    countries: ['EGY', 'SDN', 'ISR', 'PSE', 'LBN'],
    wiki: 'New_Kingdom_of_Egypt',
  },
  {
    id: 'persia', name: 'Achaemenid Persian Empire', emoji: '👑', from: -550, to: -330, span: '550 – 330 BCE', peak: 'c. 500 BCE, under Darius I', color: '#f97316',
    tagline: 'The first great world empire — from Egypt and Greece to the Indus',
    summary: 'Cyrus the Great built the largest empire the world had yet seen, and his successors held it together with tolerance, good roads and capable governors. At its height it may have ruled more of humanity than any empire before or since.',
    area: '≈ 5.5 million km²', population: '≈ 17–35 million',
    capital: { name: 'Persepolis', at: [29.93, 52.89], note: 'The ceremonial capital; kings also ruled from Susa, Babylon and Pasargadae.' },
    places: [
      { name: 'Pasargadae', at: [30.2, 53.18], note: 'Cyrus’ capital and his tomb.' },
      { name: 'Susa', at: [32.19, 48.25], note: 'The administrative capital, start of the Royal Road.' },
      { name: 'Babylon', at: [32.54, 44.42], note: 'Taken by Cyrus in 539 BCE, who let the exiled Jews go home.' },
      { name: 'Sardis', at: [38.48, 28.04], note: 'Western end of the 2,700 km Royal Road.' },
      { name: 'Marathon', at: [38.15, 23.96], note: 'Athens defeats a Persian army, 490 BCE.' },
      { name: 'Gaugamela', at: [36.36, 43.25], note: 'Alexander defeats Darius III, 331 BCE.' },
    ],
    rulers: [
      { name: 'Cyrus the Great', when: '559 – 530 BCE', note: 'Founder; famed for tolerance — the Cyrus Cylinder is sometimes called the first charter of rights.' },
      { name: 'Cambyses II', when: '530 – 522 BCE', note: 'Conquered Egypt.' },
      { name: 'Darius I', when: '522 – 486 BCE', note: 'Organised the empire into satrapies, built roads and minted coins.' },
      { name: 'Xerxes I', when: '486 – 465 BCE', note: 'Invaded Greece — Thermopylae, then defeat at Salamis.' },
      { name: 'Darius III', when: '336 – 330 BCE', note: 'The last king, defeated by Alexander.' },
    ],
    achievements: [
      'The Royal Road: relay riders could carry a message 2,700 km in about a week.',
      'Satrapies: provinces run by governors, with local customs and religions respected.',
      'Standard coins, weights and measures; qanat tunnels to irrigate the desert.',
    ],
    events: [
      { when: '550 BCE', text: 'Cyrus overthrows the Medes.' },
      { when: '539 BCE', text: 'Babylon falls to Cyrus.' },
      { when: '525 BCE', text: 'Egypt is conquered.' },
      { when: '490 & 480 BCE', text: 'Invasions of Greece: Marathon, Thermopylae, Salamis.' },
      { when: '334 – 330 BCE', text: 'Alexander the Great conquers the empire.' },
    ],
    fall: 'Alexander the Great invaded in 334 BCE, won at Issus and Gaugamela and burned Persepolis in 330 BCE. Darius III was murdered by his own nobles as he fled.',
    countries: ['IRN', 'IRQ', 'TUR', 'SYR', 'LBN', 'ISR', 'PSE', 'JOR', 'EGY', 'AFG', 'PAK', 'TKM', 'UZB', 'TJK', 'KWT', 'ARM', 'AZE', 'CYP'],
    wiki: 'Achaemenid_Empire',
  },
  {
    id: 'maurya', name: 'Maurya Empire', emoji: '🦁', from: -322, to: -185, span: '322 – 185 BCE', peak: 'c. 250 BCE, under Ashoka', color: '#fb923c',
    tagline: 'The first empire to unite most of India — and Ashoka’s turn to peace',
    summary: 'Chandragupta Maurya built an empire across most of the Indian subcontinent. His grandson Ashoka, horrified by the slaughter of his war in Kalinga, turned to Buddhism and carved messages of non-violence and tolerance on rocks and pillars across his realm.',
    area: '≈ 3.4 million km²', population: '≈ 50–60 million',
    capital: { name: 'Pataliputra (Patna)', at: [25.6, 85.1], note: 'One of the largest cities on Earth, ringed by a timber wall.' },
    places: [
      { name: 'Taxila', at: [33.74, 72.79], note: 'A great centre of learning in the north-west.' },
      { name: 'Kalinga (Dhauli)', at: [20.19, 85.84], note: 'Ashoka’s bloody war, c. 261 BCE, that changed his life.' },
      { name: 'Sanchi', at: [23.48, 77.74], note: 'The Great Stupa, begun by Ashoka.' },
      { name: 'Sarnath', at: [25.38, 83.02], note: 'Ashoka’s lion capital — today the emblem of India.' },
      { name: 'Ujjain', at: [23.18, 75.78], note: 'A provincial capital Ashoka governed as a prince.' },
    ],
    rulers: [
      { name: 'Chandragupta Maurya', when: '322 – 297 BCE', note: 'Founder, guided by the strategist Chanakya; beat back Alexander’s successor Seleucus.' },
      { name: 'Bindusara', when: '297 – 273 BCE', note: 'Extended the empire into the south.' },
      { name: 'Ashoka', when: '268 – 232 BCE', note: 'After Kalinga, ruled by “dhamma” — and sent Buddhist missions abroad.' },
    ],
    achievements: [
      'The Arthashastra, an ancient treatise on statecraft and economics.',
      'Ashoka’s edicts — the oldest deciphered texts of India — carved across the empire.',
      'Spread Buddhism to Sri Lanka and beyond; the Ashoka Chakra is on India’s flag.',
    ],
    events: [
      { when: '322 BCE', text: 'Chandragupta takes power in Magadha.' },
      { when: '305 BCE', text: 'A treaty with Seleucus: 500 war elephants for the lands of the north-west.' },
      { when: 'c. 261 BCE', text: 'The conquest of Kalinga — and Ashoka’s remorse.' },
      { when: 'c. 250 BCE', text: 'Buddhist council; missions to Sri Lanka and beyond.' },
      { when: '185 BCE', text: 'The last Maurya emperor is assassinated by his general.' },
    ],
    fall: 'After Ashoka, weaker rulers lost the provinces one by one. In 185 BCE the general Pushyamitra Shunga killed the last emperor, Brihadratha, during a military parade.',
    countries: ['IND', 'PAK', 'BGD', 'NPL', 'AFG'],
    wiki: 'Maurya_Empire',
  },
  {
    id: 'han', name: 'Han Dynasty', emoji: '🐉', from: -202, to: 220, span: '202 BCE – 220 CE', peak: 'c. 100 BCE, under Emperor Wu', color: '#ef4444',
    tagline: 'A golden age so formative that the Chinese still call themselves “Han”',
    summary: 'The Han ruled China for four centuries, building a Confucian civil service, opening the Silk Road to the west and inventing paper. Its achievements made it the model for every Chinese dynasty that followed.',
    area: '≈ 6 million km²', population: '≈ 58 million (census of 2 CE)',
    capital: { name: 'Chang’an (Xi’an)', at: [34.27, 108.94], note: 'Capital of the Western Han and eastern end of the Silk Road.' },
    places: [
      { name: 'Luoyang', at: [34.62, 112.45], note: 'Capital of the Eastern Han from 25 CE.' },
      { name: 'Dunhuang', at: [40.14, 94.66], note: 'Gateway to the Silk Road and the Western Regions.' },
      { name: 'Panyu (Guangzhou)', at: [23.13, 113.26], note: 'The southern port, conquered in 111 BCE.' },
      { name: 'Lelang (Pyongyang)', at: [39.02, 125.75], note: 'A Han commandery in the north of Korea.' },
      { name: 'Red Cliffs', at: [29.87, 113.62], note: 'The famous battle of 208 CE as the dynasty broke apart.' },
    ],
    rulers: [
      { name: 'Liu Bang (Gaozu)', when: '202 – 195 BCE', note: 'A peasant-born rebel who founded the dynasty.' },
      { name: 'Emperor Wu', when: '141 – 87 BCE', note: 'Doubled the empire, made Confucianism the state creed, sent Zhang Qian west.' },
      { name: 'Wang Mang', when: '9 – 23 CE', note: 'A usurper whose reforms failed, splitting Western and Eastern Han.' },
      { name: 'Emperor Guangwu', when: '25 – 57 CE', note: 'Restored the dynasty in Luoyang.' },
    ],
    achievements: [
      'Paper (improved by Cai Lun in 105 CE), the seismoscope and the wheelbarrow.',
      'A civil service of scholars chosen for merit and learning.',
      'Sima Qian’s Records of the Grand Historian — the model for Chinese history-writing.',
    ],
    events: [
      { when: '202 BCE', text: 'Liu Bang founds the Han.' },
      { when: '138 BCE', text: 'Zhang Qian’s mission west opens the Silk Road.' },
      { when: '2 CE', text: 'A census counts 57.7 million people.' },
      { when: '105 CE', text: 'Cai Lun presents paper to the emperor.' },
      { when: '184 CE', text: 'The Yellow Turban Rebellion.' },
      { when: '220 CE', text: 'The last Han emperor abdicates — the Three Kingdoms begin.' },
    ],
    fall: 'Court eunuchs and empresses’ families fought for power, floods and epidemics hit, and the Yellow Turban Rebellion of 184 left warlords in control. In 220 China split into the Three Kingdoms.',
    countries: ['CHN', 'VNM', 'PRK'],
    mapNote: 'The Han did not rule Tibet or Inner Mongolia; their reach into Xinjiang was a protectorate.',
    wiki: 'Han_dynasty',
  },
  {
    id: 'rome', name: 'Roman Empire', emoji: '🦅', from: -27, to: 476, span: '27 BCE – 476 CE', peak: '117 CE, under Trajan', color: '#dc2626',
    tagline: 'Roads, law and Latin — around the whole Mediterranean',
    summary: 'From a city on the Tiber, Rome grew to rule every shore of the Mediterranean. For two centuries of “Roman peace” its roads, laws, cities and armies bound together some 60 million people — a quarter of humanity.',
    area: '≈ 5 million km²', population: '≈ 60–70 million',
    capital: { name: 'Rome', at: [41.9, 12.5], note: 'About a million people at its height — the Colosseum, Forum and Pantheon.' },
    places: [
      { name: 'Constantinople', at: [41.01, 28.98], note: 'Constantine’s “New Rome”, from 330 CE.' },
      { name: 'Alexandria', at: [31.2, 29.92], note: 'The second city: Egypt’s grain fed Rome.' },
      { name: 'Hadrian’s Wall', at: [55.0, -2.3], note: 'The northern frontier in Britain, built from 122 CE.' },
      { name: 'Pompeii', at: [40.75, 14.49], note: 'Buried — and preserved — by Vesuvius in 79 CE.' },
      { name: 'Carthage', at: [36.85, 10.33], note: 'Old rival, refounded as a great Roman city.' },
      { name: 'Jerusalem', at: [31.78, 35.23], note: 'The Temple is destroyed by Roman troops in 70 CE.' },
    ],
    rulers: [
      { name: 'Augustus', when: '27 BCE – 14 CE', note: 'The first emperor; began the Pax Romana.' },
      { name: 'Claudius', when: '41 – 54', note: 'Conquered Britain.' },
      { name: 'Trajan', when: '98 – 117', note: 'Took the empire to its largest size.' },
      { name: 'Hadrian', when: '117 – 138', note: 'Built walls and the Pantheon; gave up some conquests.' },
      { name: 'Constantine', when: '306 – 337', note: 'Embraced Christianity and founded Constantinople.' },
    ],
    achievements: [
      'About 80,000 km of paved roads, aqueducts, concrete domes and arches.',
      'Roman law — the basis of many legal systems today.',
      'Latin, the parent of Spanish, Portuguese, French, Italian and Romanian.',
    ],
    events: [
      { when: '27 BCE', text: 'Augustus becomes the first emperor.' },
      { when: '79', text: 'Vesuvius buries Pompeii.' },
      { when: '80', text: 'The Colosseum opens.' },
      { when: '212', text: 'Citizenship for all free men in the empire.' },
      { when: '395', text: 'The empire splits into East and West for good.' },
      { when: '410', text: 'The Visigoths sack Rome.' },
    ],
    fall: 'Civil wars, plague, inflation and pressure from Goths, Vandals and Huns broke the western half: in 476 its last emperor was deposed. The eastern half lived on as the Byzantine Empire for another thousand years.',
    countries: ['ITA', 'ESP', 'PRT', 'FRA', 'BEL', 'LUX', 'CHE', 'AUT', 'SVN', 'HRV', 'BIH', 'SRB', 'MNE', 'ALB', 'MKD', 'GRC', 'BGR', 'ROU', 'TUR', 'CYP', 'SYR', 'LBN', 'ISR', 'PSE', 'JOR', 'EGY', 'LBY', 'TUN', 'DZA', 'MAR', 'GBR', 'HUN', 'MLT'],
    mapNote: 'Only the south of Britain and the coasts of North Africa were Roman.',
    wiki: 'Roman_Empire',
  },
  {
    id: 'byzantine', name: 'Byzantine Empire', emoji: '🏛️', from: 330, to: 1453, span: '330 – 1453', peak: '555, under Justinian I', color: '#a855f7',
    tagline: 'The eastern Roman Empire — a thousand years from Constantinople',
    summary: 'When the West fell, the eastern Roman Empire carried on, Greek-speaking and Christian, from its great capital on the Bosporus. Justinian reconquered Italy and North Africa; later centuries brought Arab conquests, crusaders and finally the Ottomans.',
    area: '≈ 2.7 million km² (555)', population: '≈ 26 million (555)',
    capital: { name: 'Constantinople (Istanbul)', at: [41.01, 28.98], note: 'For centuries the largest and richest city in Europe — Hagia Sophia and its triple walls.' },
    places: [
      { name: 'Ravenna', at: [44.42, 12.2], note: 'Capital of reconquered Italy — glittering mosaics of Justinian.' },
      { name: 'Antioch', at: [36.2, 36.16], note: 'One of the empire’s great cities until the Arab conquest.' },
      { name: 'Thessalonica', at: [40.64, 22.94], note: 'The second city of the later empire.' },
      { name: 'Yarmouk', at: [32.8, 35.95], note: 'Defeat by Arab armies, 636 — the Levant is lost.' },
      { name: 'Manzikert', at: [39.14, 42.54], note: 'Defeat by the Seljuk Turks, 1071 — Anatolia opens to the Turks.' },
    ],
    rulers: [
      { name: 'Justinian I', when: '527 – 565', note: 'Reconquered Italy and North Africa; built Hagia Sophia; codified Roman law.' },
      { name: 'Heraclius', when: '610 – 641', note: 'Beat Persia — then lost Syria and Egypt to the Arabs.' },
      { name: 'Basil II', when: '976 – 1025', note: '“The Bulgar-slayer” — the empire’s second high point.' },
      { name: 'Constantine XI', when: '1449 – 1453', note: 'The last emperor, killed defending the walls.' },
    ],
    achievements: [
      'Hagia Sophia (537) — the world’s largest building for nearly a thousand years.',
      'Justinian’s Code, which preserved Roman law for Europe.',
      'Kept Greek learning alive; its missionaries gave the Slavs the Cyrillic alphabet.',
    ],
    events: [
      { when: '330', text: 'Constantinople is dedicated as the new capital.' },
      { when: '537', text: 'Hagia Sophia is completed.' },
      { when: '541', text: 'The Plague of Justinian.' },
      { when: '1054', text: 'The Great Schism between the Orthodox and Catholic churches.' },
      { when: '1204', text: 'Crusaders sack Constantinople.' },
      { when: '1453', text: 'The Ottomans take Constantinople.' },
    ],
    fall: 'Weakened by the Arab conquests, the loss of Anatolia after Manzikert and the crusaders’ sack of 1204, the empire shrank to little more than its capital. On 29 May 1453 Mehmed II’s cannons broke the walls.',
    countries: ['TUR', 'GRC', 'ITA', 'TUN', 'LBY', 'EGY', 'SYR', 'LBN', 'ISR', 'PSE', 'JOR', 'CYP', 'ALB', 'MKD'],
    wiki: 'Byzantine_Empire',
  },
  {
    id: 'umayyad', name: 'Umayyad Caliphate', emoji: '🕌', from: 661, to: 750, span: '661 – 750', peak: 'c. 720', color: '#22c55e',
    tagline: 'From Spain to India in a single century',
    summary: 'The first great Islamic dynasty ruled from Damascus over an empire stretching from the Atlantic to the Indus — one of the largest the world had seen. Arabic became the language of government, and the Dome of the Rock rose in Jerusalem.',
    area: '≈ 11 million km²', population: '≈ 30 million',
    capital: { name: 'Damascus', at: [33.51, 36.29], note: 'The Great Mosque of Damascus, built 706–715.' },
    places: [
      { name: 'Jerusalem', at: [31.78, 35.23], note: 'The Dome of the Rock, completed in 691.' },
      { name: 'Kairouan', at: [35.68, 10.1], note: 'Its Great Mosque was the base for North Africa.' },
      { name: 'Gibraltar', at: [36.14, -5.35], note: 'Named after Tariq ibn Ziyad, who crossed to Spain in 711.' },
      { name: 'Córdoba', at: [37.88, -4.78], note: 'Capital of al-Andalus — the Umayyads ruled on here after 756.' },
      { name: 'Samarkand', at: [39.65, 66.96], note: 'Taken in 712 on the road to Central Asia.' },
      { name: 'Tours', at: [47.39, 0.69], note: 'In 732 the Franks halt the advance into France.' },
    ],
    rulers: [
      { name: 'Muʿawiya I', when: '661 – 680', note: 'Founder; made Damascus the capital.' },
      { name: 'ʿAbd al-Malik', when: '685 – 705', note: 'Built the Dome of the Rock; made Arabic official; minted Islamic coins.' },
      { name: 'al-Walid I', when: '705 – 715', note: 'His generals conquered Spain, Sindh and Transoxiana.' },
      { name: 'Marwan II', when: '744 – 750', note: 'The last caliph, overthrown by the Abbasids.' },
    ],
    achievements: [
      'The Dome of the Rock and the Great Mosque of Damascus.',
      'Arabic as a common language of government from Spain to Central Asia.',
      'The first purely Islamic coinage.',
    ],
    events: [
      { when: '661', text: 'Muʿawiya founds the dynasty.' },
      { when: '691', text: 'The Dome of the Rock is completed.' },
      { when: '711', text: 'Armies cross into Spain and reach the Indus.' },
      { when: '717 – 718', text: 'A great siege of Constantinople fails.' },
      { when: '732', text: 'Defeat at Tours.' },
      { when: '750', text: 'The Abbasid revolution.' },
    ],
    fall: 'Resentment from non-Arab Muslims and rival factions fed the Abbasid revolution of 750; most of the Umayyad family was killed. One prince, Abd al-Rahman, escaped to Spain and founded a new Umayyad state at Córdoba.',
    countries: ['ESP', 'PRT', 'MAR', 'DZA', 'TUN', 'LBY', 'EGY', 'SAU', 'YEM', 'OMN', 'ARE', 'QAT', 'BHR', 'KWT', 'IRQ', 'SYR', 'JOR', 'ISR', 'PSE', 'LBN', 'IRN', 'AFG', 'PAK', 'TKM', 'UZB', 'TJK', 'AZE', 'ARM'],
    wiki: 'Umayyad_Caliphate',
  },
  {
    id: 'mongol', focus: [45, 85], name: 'Mongol Empire', emoji: '🏹', from: 1206, to: 1368, span: '1206 – 1368', peak: '1279, under Kublai Khan', color: '#0ea5e9',
    tagline: 'The largest land empire in history, won on horseback',
    summary: 'Genghis Khan united the Mongol tribes in 1206, and within 70 years his armies of mounted archers had conquered from Korea to Hungary. The empire was brutal in conquest — but then opened the Silk Road as never before, carrying traders, envoys and ideas across Eurasia.',
    area: '≈ 24 million km² — the largest contiguous empire ever', population: '≈ 100 million+',
    capital: { name: 'Karakorum', at: [47.2, 102.8], note: 'The steppe capital; Kublai later ruled from Khanbaliq (Beijing).' },
    places: [
      { name: 'Khanbaliq (Beijing)', at: [39.9, 116.4], note: 'Kublai Khan’s capital as emperor of the Yuan dynasty.' },
      { name: 'Samarkand', at: [39.65, 66.96], note: 'Destroyed in 1220 in the war on Khwarazm.' },
      { name: 'Kyiv', at: [50.45, 30.52], note: 'Sacked in 1240.' },
      { name: 'Baghdad', at: [33.31, 44.36], note: 'Sacked in 1258 — the end of the Abbasid caliphate.' },
      { name: 'Ain Jalut', at: [32.55, 35.35], note: 'The Mamluks of Egypt halt the Mongols, 1260.' },
      { name: 'Hakata Bay, Japan', at: [33.6, 130.4], note: 'Invasions of 1274 and 1281 wrecked by typhoons — the “kamikaze”.' },
    ],
    rulers: [
      { name: 'Genghis Khan', when: '1206 – 1227', note: 'Founder; promoted by merit, not birth.' },
      { name: 'Ögedei', when: '1229 – 1241', note: 'Built Karakorum; his armies reached Poland and Hungary.' },
      { name: 'Möngke', when: '1251 – 1259', note: 'Sent his brothers to conquer Persia and China.' },
      { name: 'Kublai Khan', when: '1260 – 1294', note: 'Conquered Song China; welcomed Marco Polo.' },
    ],
    achievements: [
      'The yam: relay stations every few dozen kilometres carried messages across Asia.',
      'The “Pax Mongolica”: safe passage for merchants and travellers on the Silk Road.',
      'Religious tolerance and paper money across a vast realm.',
    ],
    events: [
      { when: '1206', text: 'Temüjin is proclaimed Genghis Khan.' },
      { when: '1219 – 1221', text: 'The destruction of the Khwarazmian Empire.' },
      { when: '1241', text: 'Victories in Poland and Hungary — then a sudden withdrawal.' },
      { when: '1258', text: 'Baghdad falls.' },
      { when: '1279', text: 'The conquest of Song China is complete.' },
      { when: '1368', text: 'The Ming drive the Yuan out of China.' },
    ],
    fall: 'After 1260 the empire split into four khanates — the Golden Horde, Chagatai, the Ilkhanate and Yuan China — which often fought each other. Plague, rebellions and the rise of the Ming ended Mongol rule in China in 1368.',
    countries: ['MNG', 'CHN', 'RUS', 'KAZ', 'KGZ', 'UZB', 'TKM', 'TJK', 'AFG', 'IRN', 'IRQ', 'GEO', 'ARM', 'AZE', 'UKR', 'PRK', 'KOR'],
    mapNote: 'The Mongols ruled southern and central Russia, not its Arctic north; Korea was a vassal.',
    wiki: 'Mongol_Empire',
  },
  {
    id: 'mali', name: 'Mali Empire', emoji: '🪙', from: 1235, to: 1600, span: 'c. 1235 – 1600', peak: 'c. 1350', color: '#eab308',
    tagline: 'Gold, salt and scholarship — the empire of Mansa Musa',
    summary: 'Sundiata Keita founded Mali on the upper Niger, and it grew rich on the trade of West African gold for Saharan salt. Its most famous ruler, Mansa Musa, made a pilgrimage to Mecca so lavish that he became a legend across the Islamic world and Europe.',
    area: '≈ 1.1 million km²', population: 'Millions — estimates vary widely',
    capital: { name: 'Niani', at: [11.39, -8.4], note: 'The royal capital — its exact site is still debated.' },
    places: [
      { name: 'Timbuktu', at: [16.77, -3.0], note: 'Mosques, universities and hundreds of thousands of manuscripts.' },
      { name: 'Djenné', at: [13.91, -4.55], note: 'Trading city, famous for its mud-brick Great Mosque.' },
      { name: 'Gao', at: [16.27, -0.04], note: 'A great Niger port — later capital of the Songhai.' },
      { name: 'Taghaza', at: [23.6, -5.0], note: 'Saharan salt mines, where houses were built of salt.' },
      { name: 'Bambuk goldfields', at: [12.5, -11.3], note: 'Source of much of the world’s gold.' },
    ],
    rulers: [
      { name: 'Sundiata Keita', when: 'c. 1235 – 1255', note: 'The “Lion King” of the Epic of Sundiata; founder.' },
      { name: 'Mansa Musa', when: '1312 – 1337', note: 'His 1324 pilgrimage gave out so much gold it lowered its price in Cairo.' },
      { name: 'Mansa Suleyman', when: '1341 – 1360', note: 'Ruled when Ibn Battuta visited.' },
    ],
    achievements: [
      'The Kouroukan Fouga (1236), an oral charter often called one of the first constitutions.',
      'Timbuktu’s Sankore and Djinguereber mosques — centres of Islamic scholarship.',
      'Control of the trans-Saharan gold trade.',
    ],
    events: [
      { when: 'c. 1235', text: 'Sundiata wins the Battle of Kirina.' },
      { when: '1324', text: 'Mansa Musa’s pilgrimage to Mecca.' },
      { when: '1327', text: 'The Djinguereber Mosque is built in Timbuktu.' },
      { when: '1352', text: 'Ibn Battuta visits the court.' },
      { when: '1375', text: 'The Catalan Atlas shows Mansa Musa holding a gold nugget.' },
    ],
    fall: 'Succession fights weakened the empire; Songhai, centred on Gao, broke away in the 1400s and overtook it, and Atlantic trade drew gold away from the Sahara. By about 1600 Mali was a small kingdom.',
    countries: ['MLI', 'SEN', 'GMB', 'GIN', 'MRT', 'GNB'],
    wiki: 'Mali_Empire',
  },
  {
    id: 'ottoman', name: 'Ottoman Empire', emoji: '🌙', from: 1299, to: 1922, span: '1299 – 1922', peak: '1683', color: '#14b8a6',
    tagline: 'Six centuries ruling three continents from Istanbul',
    summary: 'From a small Turkish principality in Anatolia, the Ottomans took Constantinople in 1453 and built an empire across south-eastern Europe, the Middle East and North Africa. Under Suleiman the Magnificent it was one of the most powerful states on Earth.',
    area: '≈ 5.2 million km²', population: '≈ 30 million',
    capital: { name: 'Istanbul', at: [41.01, 28.98], note: 'Capital from 1453 — Topkapı Palace and Sinan’s mosques.' },
    places: [
      { name: 'Bursa', at: [40.19, 29.06], note: 'The first Ottoman capital.' },
      { name: 'Edirne', at: [41.68, 26.56], note: 'Capital in the Balkans before 1453.' },
      { name: 'Vienna', at: [48.21, 16.37], note: 'Besieged in 1529 and 1683 — the high-water mark.' },
      { name: 'Cairo', at: [30.04, 31.24], note: 'Conquered in 1517.' },
      { name: 'Mecca', at: [21.42, 39.83], note: 'The sultans became guardians of Islam’s holiest cities.' },
      { name: 'Gallipoli', at: [40.24, 26.28], note: 'Allied invasion repelled, 1915.' },
    ],
    rulers: [
      { name: 'Osman I', when: 'c. 1299 – 1324', note: 'Founder — “Ottoman” comes from his name.' },
      { name: 'Mehmed II', when: '1451 – 1481', note: 'The Conqueror: took Constantinople at 21.' },
      { name: 'Selim I', when: '1512 – 1520', note: 'Conquered Egypt, Syria and the holy cities.' },
      { name: 'Suleiman the Magnificent', when: '1520 – 1566', note: 'Lawgiver, patron of art and architecture; the empire’s peak.' },
      { name: 'Mehmed VI', when: '1918 – 1922', note: 'The last sultan.' },
    ],
    achievements: [
      'The architect Mimar Sinan’s mosques, including the Süleymaniye.',
      'The millet system, letting religious communities run their own affairs.',
      'Coffee houses, Iznik tiles and a rich tradition of law (kanun).',
    ],
    events: [
      { when: '1453', text: 'Constantinople falls to Mehmed II.' },
      { when: '1517', text: 'Egypt and the holy cities are taken.' },
      { when: '1529', text: 'The first siege of Vienna.' },
      { when: '1571', text: 'Naval defeat at Lepanto.' },
      { when: '1683', text: 'The second siege of Vienna fails.' },
      { when: '1914 – 1918', text: 'Defeat in the First World War.' },
    ],
    fall: 'Long wars with Austria and Russia, nationalist revolts in the Balkans and economic decline earned it the name “sick man of Europe”. After defeat in the First World War the sultanate was abolished in 1922, and Atatürk founded the Republic of Turkey.',
    countries: ['TUR', 'GRC', 'BGR', 'ROU', 'SRB', 'BIH', 'MNE', 'ALB', 'MKD', 'HUN', 'MDA', 'CYP', 'SYR', 'LBN', 'ISR', 'PSE', 'JOR', 'IRQ', 'EGY', 'LBY', 'TUN', 'DZA', 'KWT'],
    mapNote: 'In Arabia the Ottomans held only the Red Sea coast and the holy cities.',
    wiki: 'Ottoman_Empire',
  },
  {
    id: 'inca', name: 'Inca Empire', emoji: '🏔️', from: 1438, to: 1533, span: '1438 – 1533', peak: '1527, under Huayna Capac', color: '#f59e0b',
    tagline: 'The largest empire of the Americas, joined by roads along the Andes',
    summary: 'In less than a century the Inca of Cusco built an empire 4,000 km long down the Andes, held together by roads, runners, terraced farms and storehouses — all without money, wheels or writing. Then, weakened by smallpox and civil war, it fell to a few hundred Spaniards.',
    area: '≈ 2 million km²', population: '≈ 10–12 million',
    capital: { name: 'Cusco', at: [-13.52, -71.97], note: '“The navel of the world” — its Temple of the Sun was covered in gold.' },
    places: [
      { name: 'Machu Picchu', at: [-13.16, -72.55], note: 'Pachacuti’s mountain estate, built about 1450.' },
      { name: 'Quito', at: [-0.18, -78.47], note: 'The northern capital.' },
      { name: 'Cajamarca', at: [-7.16, -78.51], note: 'Where Pizarro captured Atahualpa in 1532.' },
      { name: 'Lake Titicaca', at: [-15.84, -69.33], note: 'Where the Inca said their ancestors first emerged.' },
      { name: 'Chan Chan', at: [-8.11, -79.07], note: 'Capital of the Chimú, conquered around 1470.' },
    ],
    rulers: [
      { name: 'Pachacuti', when: '1438 – 1471', note: '“Earth-shaker”: turned a kingdom into an empire and rebuilt Cusco.' },
      { name: 'Topa Inca', when: '1471 – 1493', note: 'Conquered the Chimú and pushed south into Chile.' },
      { name: 'Huayna Capac', when: '1493 – 1527', note: 'Ruled at the peak; died of smallpox before the Spanish arrived.' },
      { name: 'Atahualpa', when: '1532 – 1533', note: 'Won a civil war — then was captured and executed by Pizarro.' },
    ],
    achievements: [
      'The Qhapaq Ñan: some 40,000 km of roads and rope bridges.',
      'Quipu — knotted cords used to keep accounts and records.',
      'Mountain terraces, freeze-dried potatoes (chuño) and storehouses against famine.',
    ],
    events: [
      { when: '1438', text: 'Pachacuti defeats the Chanka and takes power.' },
      { when: 'c. 1450', text: 'Machu Picchu is built.' },
      { when: 'c. 1470', text: 'The Chimú kingdom is conquered.' },
      { when: '1527', text: 'Smallpox kills Huayna Capac; civil war follows.' },
      { when: '1532', text: 'Pizarro seizes Atahualpa at Cajamarca.' },
      { when: '1572', text: 'The last Inca, Túpac Amaru, is executed.' },
    ],
    fall: 'European diseases raced ahead of the conquistadors, killing the emperor and setting off a civil war between his sons. In 1532 Francisco Pizarro’s 168 men captured Atahualpa; the last Inca stronghold, Vilcabamba, fell in 1572.',
    countries: ['PER', 'ECU', 'BOL', 'CHL'],
    mapNote: 'The Inca also held north-west Argentina; in Chile they reached only the centre.',
    wiki: 'Inca_Empire',
  },
  {
    id: 'spanish', focus: [5, -55], name: 'Spanish Empire', emoji: '⛵', from: 1492, to: 1976, span: '1492 – 1976', peak: 'c. 1790', color: '#fde047',
    tagline: '“The empire on which the sun never sets”',
    summary: 'After Columbus, Spain conquered the Aztec and Inca empires and built the first truly global empire, from the Americas to the Philippines. Silver from Potosí and Mexico flowed to Europe and China — while conquest, forced labour and disease devastated Indigenous peoples.',
    area: '≈ 13.7 million km²', population: 'Tens of millions',
    capital: { name: 'Madrid', at: [40.42, -3.7], note: 'Capital from 1561; Seville ran the trade with the Indies.' },
    places: [
      { name: 'Seville', at: [37.39, -5.98], note: 'All American trade passed through here.' },
      { name: 'Mexico City', at: [19.43, -99.13], note: 'Capital of New Spain, built on Tenochtitlan.' },
      { name: 'Lima', at: [-12.05, -77.04], note: 'Capital of the Viceroyalty of Peru.' },
      { name: 'Potosí', at: [-19.59, -65.75], note: 'The silver mountain — mined by forced Indigenous labour.' },
      { name: 'Havana', at: [23.13, -82.38], note: 'Where the treasure fleets gathered.' },
      { name: 'Manila', at: [14.6, 120.98], note: 'Spain’s gateway to China, via the Manila galleons.' },
    ],
    rulers: [
      { name: 'Isabella I & Ferdinand II', when: '1474 – 1516', note: 'United Spain and sponsored Columbus.' },
      { name: 'Charles V', when: '1516 – 1556', note: 'Also Holy Roman Emperor: ruled half of Europe and the Americas.' },
      { name: 'Philip II', when: '1556 – 1598', note: 'Added Portugal’s empire in 1580; sent the Armada.' },
      { name: 'Charles III', when: '1759 – 1788', note: 'Reformed the empire at its largest.' },
    ],
    achievements: [
      'Spanish is now spoken by about 500 million people.',
      'The silver “piece of eight” — the first global currency.',
      'The Columbian Exchange of crops, animals and people — with devastating losses for the Americas.',
    ],
    events: [
      { when: '1492', text: 'Columbus reaches the Caribbean.' },
      { when: '1521', text: 'Tenochtitlan falls to Cortés.' },
      { when: '1533', text: 'Pizarro takes Cusco.' },
      { when: '1565', text: 'The Manila galleons begin to cross the Pacific.' },
      { when: '1810 – 1825', text: 'Most of Spanish America wins independence.' },
      { when: '1898', text: 'Cuba, Puerto Rico and the Philippines are lost to the USA.' },
    ],
    fall: 'Napoleon’s invasion of Spain in 1808 sparked independence wars led by Bolívar and San Martín, and by 1825 almost all the mainland Americas were free. Defeat by the United States in 1898 took the rest; the last colony, Western Sahara, was given up in 1976.',
    countries: ['ESP', 'MEX', 'GTM', 'HND', 'SLV', 'NIC', 'CRI', 'PAN', 'CUB', 'DOM', 'PRI', 'COL', 'VEN', 'ECU', 'PER', 'BOL', 'CHL', 'ARG', 'PRY', 'URY', 'PHL', 'GNQ'],
    mapNote: 'Spain also claimed much of today’s south-western and southern USA.',
    wiki: 'Spanish_Empire',
  },
  {
    id: 'mughal', name: 'Mughal Empire', emoji: '💎', from: 1526, to: 1857, span: '1526 – 1857', peak: '1707, under Aurangzeb', color: '#ec4899',
    tagline: 'The Taj Mahal, and a quarter of the world’s wealth',
    summary: 'Babur, a descendant of both Genghis Khan and Timur, swept into India from Kabul in 1526. His successors — above all Akbar — built a rich, cosmopolitan empire whose cities, textiles and art were the wonder of the world.',
    area: '≈ 4 million km²', population: '≈ 150 million — about a quarter of humanity',
    capital: { name: 'Delhi (Shahjahanabad)', at: [28.65, 77.23], note: 'Shah Jahan’s capital with the Red Fort; Agra and Lahore also served.' },
    places: [
      { name: 'Agra', at: [27.18, 78.0], note: 'The Taj Mahal, built 1632–1653.' },
      { name: 'Fatehpur Sikri', at: [27.09, 77.66], note: 'Akbar’s red sandstone city.' },
      { name: 'Lahore', at: [31.55, 74.34], note: 'The Badshahi Mosque and Lahore Fort.' },
      { name: 'Panipat', at: [29.39, 76.97], note: 'Babur’s victory of 1526 founds the empire.' },
      { name: 'Dhaka', at: [23.81, 90.41], note: 'Bengal’s fine muslins were prized worldwide.' },
      { name: 'Plassey', at: [23.8, 88.25], note: 'The British East India Company wins Bengal, 1757.' },
    ],
    rulers: [
      { name: 'Babur', when: '1526 – 1530', note: 'Founder; wrote a famously candid memoir.' },
      { name: 'Akbar', when: '1556 – 1605', note: 'Conqueror and reformer, famed for religious tolerance.' },
      { name: 'Shah Jahan', when: '1628 – 1658', note: 'Built the Taj Mahal for his wife Mumtaz Mahal.' },
      { name: 'Aurangzeb', when: '1658 – 1707', note: 'Took the empire to its largest; strict and endlessly at war.' },
      { name: 'Bahadur Shah II', when: '1837 – 1857', note: 'The last emperor, exiled by the British to Burma.' },
    ],
    achievements: [
      'The Taj Mahal, the Red Fort and Humayun’s Tomb.',
      'Miniature painting, and Urdu flourishing as a language of poetry.',
      'India produced roughly a quarter of the world’s goods, especially textiles.',
    ],
    events: [
      { when: '1526', text: 'Babur wins at Panipat.' },
      { when: '1556', text: 'Akbar comes to the throne at 13.' },
      { when: '1632 – 1653', text: 'The Taj Mahal is built.' },
      { when: '1707', text: 'Aurangzeb dies; the empire begins to break up.' },
      { when: '1739', text: 'Nader Shah of Persia sacks Delhi and takes the Peacock Throne.' },
      { when: '1857', text: 'The Indian Rebellion; the British end the dynasty.' },
    ],
    fall: 'After Aurangzeb, the Marathas, regional governors, Persian and Afghan invaders and the British East India Company carved up the empire. After the rebellion of 1857 the British exiled the last emperor and ruled India directly.',
    countries: ['IND', 'PAK', 'BGD', 'AFG'],
    mapNote: 'The far south of India stayed largely outside Mughal rule.',
    wiki: 'Mughal_Empire',
  },
  {
    id: 'qing', name: 'Qing Dynasty', emoji: '🏯', from: 1644, to: 1912, span: '1644 – 1912', peak: 'c. 1790, under Qianlong', color: '#f43f5e',
    tagline: 'China’s last dynasty — and its largest',
    summary: 'The Manchus from the north-east conquered Ming China and doubled its size, adding Mongolia, Tibet, Xinjiang and Taiwan. Under the long-lived Kangxi and Qianlong emperors, China was rich and peaceful — before the 19th century brought opium wars, rebellions and humiliation.',
    area: '≈ 13 million km²', population: '≈ 300 million (1790) — a third of humanity',
    capital: { name: 'Beijing', at: [39.92, 116.39], note: 'The Forbidden City, home to 24 Ming and Qing emperors.' },
    places: [
      { name: 'Mukden (Shenyang)', at: [41.8, 123.43], note: 'The Manchu capital before 1644.' },
      { name: 'Chengde', at: [40.99, 117.94], note: 'The emperors’ summer retreat.' },
      { name: 'Canton (Guangzhou)', at: [23.13, 113.26], note: 'The only port open to Western traders until 1842.' },
      { name: 'Lhasa', at: [29.65, 91.12], note: 'Tibet under Qing protection from 1720.' },
      { name: 'Kashgar', at: [39.47, 75.99], note: 'Xinjiang conquered in 1759.' },
      { name: 'Hong Kong', at: [22.3, 114.17], note: 'Ceded to Britain after the Opium War, 1842.' },
    ],
    rulers: [
      { name: 'Kangxi', when: '1661 – 1722', note: 'China’s longest-reigning emperor; scholar and conqueror.' },
      { name: 'Yongzheng', when: '1722 – 1735', note: 'A hard-working reformer.' },
      { name: 'Qianlong', when: '1735 – 1796', note: 'Ruled at the peak; turned away Britain’s Macartney mission.' },
      { name: 'Empress Dowager Cixi', when: '1861 – 1908', note: 'The real power behind the throne for nearly 50 years.' },
      { name: 'Puyi', when: '1908 – 1912', note: 'The last emperor, who abdicated aged six.' },
    ],
    achievements: [
      'The largest China in history, roughly today’s borders plus Mongolia.',
      'The Kangxi Dictionary and the vast Siku Quanshu library.',
      'Porcelain, silk and tea that the whole world wanted.',
    ],
    events: [
      { when: '1644', text: 'The Manchus enter Beijing.' },
      { when: '1683', text: 'Taiwan is conquered.' },
      { when: '1793', text: 'The Macartney mission from Britain is rebuffed.' },
      { when: '1839 – 1842', text: 'The First Opium War with Britain.' },
      { when: '1850 – 1864', text: 'The Taiping Rebellion — over 20 million die.' },
      { when: '1912', text: 'The last emperor abdicates; China becomes a republic.' },
    ],
    fall: 'Population pressure, corruption, defeat in the Opium Wars and by Japan, and the devastating Taiping Rebellion drained the dynasty. The 1911 revolution, led by Sun Yat-sen’s supporters, ended 2,000 years of imperial rule in 1912.',
    countries: ['CHN', 'MNG', 'TWN'],
    wiki: 'Qing_dynasty',
  },
  {
    id: 'russian', focus: [55, 85], name: 'Russian Empire', emoji: '❄️', from: 1721, to: 1917, span: '1721 – 1917', peak: '1866, including Alaska', color: '#38bdf8',
    tagline: 'From the Baltic to the Pacific — a sixth of the world’s land',
    summary: 'Peter the Great proclaimed Russia an empire and built a new capital facing Europe. His successors pushed its borders across Siberia to the Pacific, into Central Asia and the Caucasus — even into Alaska — ruling the largest country on Earth.',
    area: '≈ 22.8 million km²', population: '≈ 180 million (1916)',
    capital: { name: 'St Petersburg', at: [59.94, 30.32], note: 'Built by Peter the Great on the Baltic from 1703.' },
    places: [
      { name: 'Moscow', at: [55.75, 37.62], note: 'The old capital, burned as Napoleon arrived in 1812.' },
      { name: 'Sitka, Alaska', at: [57.05, -135.33], note: 'Capital of Russian America — sold to the USA in 1867.' },
      { name: 'Vladivostok', at: [43.12, 131.89], note: '“Ruler of the East”, founded 1860.' },
      { name: 'Sevastopol', at: [44.6, 33.52], note: 'Besieged in the Crimean War, 1854–1855.' },
      { name: 'Tashkent', at: [41.3, 69.24], note: 'Taken in 1865 as Russia expanded into Central Asia.' },
    ],
    rulers: [
      { name: 'Peter the Great', when: '1682 – 1725', note: 'Modernised Russia on European lines; the first emperor.' },
      { name: 'Catherine the Great', when: '1762 – 1796', note: 'Took Crimea and much of Poland; patron of the arts.' },
      { name: 'Alexander I', when: '1801 – 1825', note: 'Defeated Napoleon.' },
      { name: 'Alexander II', when: '1855 – 1881', note: 'Freed the serfs in 1861; sold Alaska.' },
      { name: 'Nicholas II', when: '1894 – 1917', note: 'The last tsar.' },
    ],
    achievements: [
      'The Trans-Siberian Railway (1891–1916), the longest in the world.',
      'Pushkin, Tolstoy, Dostoevsky and Tchaikovsky; the Hermitage.',
      'Mendeleev’s periodic table (1869).',
    ],
    events: [
      { when: '1721', text: 'Peter the Great is proclaimed emperor.' },
      { when: '1812', text: 'Napoleon’s invasion ends in disaster.' },
      { when: '1861', text: 'The serfs are emancipated.' },
      { when: '1867', text: 'Alaska is sold to the United States.' },
      { when: '1905', text: 'Defeat by Japan and revolution.' },
      { when: '1917', text: 'Revolution — the tsar abdicates.' },
    ],
    fall: 'Crushing losses in the First World War, food shortages and strikes brought revolution in February 1917; the tsar abdicated, and in October the Bolsheviks seized power. Nicholas II and his family were shot in 1918.',
    countries: ['RUS', 'UKR', 'BLR', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK', 'GEO', 'ARM', 'AZE', 'MDA', 'FIN', 'EST', 'LVA', 'LTU', 'POL'],
    mapNote: 'Only part of today’s Poland was Russian.',
    wiki: 'Russian_Empire',
  },
  {
    id: 'british', focus: [15, 45], name: 'British Empire', emoji: '⚓', from: 1583, to: 1997, span: '1583 – 1997', peak: '1920', color: '#e11d48',
    tagline: 'The largest empire in history — a quarter of the world',
    summary: 'Built on sea power, trade and the industrial revolution, Britain’s empire grew from small colonies in America to rule about a quarter of the world’s land and people. Its legacy — the English language, parliaments, railways, the Commonwealth — is everywhere, alongside a long history of exploitation and violence.',
    area: '≈ 35.5 million km² — a quarter of the world’s land', population: '≈ 412 million (1913) — a quarter of humanity',
    capital: { name: 'London', at: [51.51, -0.13], note: 'The largest city in the world in 1900.' },
    places: [
      { name: 'Jamestown', at: [37.21, -76.78], note: 'The first lasting English colony, 1607.' },
      { name: 'Calcutta (Kolkata)', at: [22.57, 88.36], note: 'Capital of British India until 1911.' },
      { name: 'Cape Town', at: [-33.92, 18.42], note: 'British from 1806, on the route to India.' },
      { name: 'Sydney', at: [-33.86, 151.21], note: 'The First Fleet arrives in 1788.' },
      { name: 'Singapore', at: [1.29, 103.85], note: 'Founded as a trading post in 1819.' },
      { name: 'Hong Kong', at: [22.3, 114.17], note: 'British 1842–1997.' },
    ],
    rulers: [
      { name: 'Elizabeth I', when: '1558 – 1603', note: 'Her reign saw the first colonial ventures.' },
      { name: 'George III', when: '1760 – 1820', note: 'Lost the American colonies.' },
      { name: 'Victoria', when: '1837 – 1901', note: 'Empress of India; the empire’s great century.' },
      { name: 'George V', when: '1910 – 1936', note: 'King at the empire’s greatest extent.' },
      { name: 'Elizabeth II', when: '1952 – 2022', note: 'Saw empire become the Commonwealth.' },
    ],
    achievements: [
      'English as the world’s common language.',
      'Parliamentary government and common law in dozens of countries.',
      'Railways and ports — built to move resources out, often at great cost to local people.',
    ],
    events: [
      { when: '1607', text: 'Jamestown is founded.' },
      { when: '1757', text: 'Victory at Plassey begins British rule in India.' },
      { when: '1776', text: 'The American colonies declare independence.' },
      { when: '1807', text: 'Britain abolishes the slave trade.' },
      { when: '1947', text: 'India and Pakistan become independent.' },
      { when: '1997', text: 'Hong Kong is returned to China.' },
    ],
    fall: 'Two world wars drained Britain, and independence movements — led by figures like Gandhi, Nkrumah and Kenyatta — grew unstoppable. India’s independence in 1947 began decades of decolonisation; Hong Kong’s handover in 1997 is often taken as the end.',
    countries: ['GBR', 'IRL', 'CAN', 'AUS', 'NZL', 'IND', 'PAK', 'BGD', 'MMR', 'LKA', 'MYS', 'SGP', 'EGY', 'SDN', 'SSD', 'KEN', 'UGA', 'TZA', 'ZMB', 'ZWE', 'MWI', 'BWA', 'ZAF', 'LSO', 'SWZ', 'NGA', 'GHA', 'SLE', 'GMB', 'JAM', 'BHS', 'GUY', 'BLZ', 'IRQ', 'JOR', 'ISR', 'PSE', 'CYP', 'MLT', 'FJI', 'PNG', 'TTO'],
    mapNote: 'Shown at its 1920 height, including protectorates and mandates.',
    wiki: 'British_Empire',
  },
];
/** Oldest first: the timeline. */
export const EMPIRES = [...LIST].sort((a, b) => a.from - b.from);

export const BY_EMPIRE = new Map(EMPIRES.map((e) => [e.id, e]));
export const fmtYear = (y: number) => (y < 0 ? `${-y} BCE` : `${y}`);

const rad = (d: number) => (d * Math.PI) / 180;
/** Where to aim the camera: the middle of the empire's lands, far enough out to see them all. */
export function empireView(e: Empire) {
  const pts = e.countries.map((c) => BY_CCA3.get(c)?.latlng).filter((p): p is [number, number] => !!p);
  let x = 0, y = 0, z = 0;
  for (const [la, lo] of pts) { x += Math.cos(rad(la)) * Math.cos(rad(lo)); y += Math.cos(rad(la)) * Math.sin(rad(lo)); z += Math.sin(rad(la)); }
  const [lat, lng] = e.focus ?? [(Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, (Math.atan2(y, x) * 180) / Math.PI];
  const ang = ([a, o]: [number, number]) => (Math.acos(Math.min(1, Math.sin(rad(lat)) * Math.sin(rad(a)) + Math.cos(rad(lat)) * Math.cos(rad(a)) * Math.cos(rad(o - lng)))) * 180) / Math.PI;
  const spread = Math.max(10, ...pts.map(ang));
  return { lat, lng, altitude: Math.min(3.2, Math.max(1.0, 0.45 + spread / 26)) };
}
