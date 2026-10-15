// Famous voyages: who sailed where, the route (drawn on the globe), the stops along the way, and why
// it mattered. Routes are [lat, lng] and keep to the sea between stops (extra points steer them
// round coasts); a number in a route is the index of a stop. More voyages live in voyagesMore.ts.
import { MORE } from './voyagesMore';

export type LL = [number, number];
export interface Stop { name: string; at: LL; when: string; note: string }
/** Someone who died on the voyage, at a stop. */
export interface Death { stop: number; who: string; text: string }
export interface Voyage {
  id: string;
  voyager: string;         // who
  short: string;           // what to call them in a sentence ("Columbus")
  title: string;           // the voyage, in a few words
  years: string;
  year: number;            // for ordering
  flag?: string;           // ISO 3166 alpha-2 of who they sailed for (none: Polynesian navigators)
  sailedFor: string;
  ships: string;
  crew: string;
  color: string;
  tagline: string;         // one line for the list
  story: string;
  mattered: string[];
  life: string;            // "c. 1460 – 1524"
  bio: string;
  wiki: string;            // Wikipedia page (for the portrait and "read more")
  stops: Stop[];
  route: (number | LL)[];
  /** Where to centre the camera when the route spans half the world (else: the route's middle). */
  focus?: LL;
  deaths?: Death[];
}

const LIST: Voyage[] = [
  {
    id: 'leif-erikson', voyager: 'Leif Erikson', short: 'Leif', title: 'Vinland', years: 'c. 1000', year: 1000,
    flag: 'is', sailedFor: 'Norse Greenland', ships: '1 knarr', crew: '~35', color: '#93c5fd',
    tagline: 'Norse sailors reach North America, 500 years before Columbus',
    story: 'Following a sailor’s tale of unknown land to the west, Leif sailed from Norse Greenland and named three coasts: Helluland (“flat-stone land”), Markland (“forest land”) and Vinland (“wine land”). His crew wintered at Vinland before sailing home.',
    mattered: [
      'The first Europeans known to have set foot in mainland North America.',
      'Confirmed in 1960, when a Norse settlement was found at L’Anse aux Meadows in Newfoundland — now a UNESCO World Heritage Site.',
    ],
    life: 'c. 970 – c. 1020',
    bio: 'Son of Erik the Red, founder of the Norse colony in Greenland. Born in Iceland, Leif is said to have brought Christianity to Greenland and later led the colony from his father’s farm at Brattahlíð.',
    wiki: 'Leif_Erikson',
    stops: [
      { name: 'Brattahlíð, Greenland', at: [61.15, -45.52], when: 'c. 1000', note: 'Sets out from his father’s farm in the Norse settlement on Greenland’s south-west coast.' },
      { name: 'Helluland (Baffin Island)', at: [63.2, -65.0], when: 'c. 1000', note: 'A barren land of flat stones and glaciers — “nothing good about it”, said the sagas.' },
      { name: 'Markland (Labrador)', at: [54.2, -57.2], when: 'c. 1000', note: 'Low, wooded coast with white beaches: a source of timber treeless Greenland lacked.' },
      { name: 'Vinland (Newfoundland)', at: [51.6, -55.53], when: 'c. 1000', note: 'Grass, salmon and wild grapes. The Norse built houses and wintered here.' },
    ],
    route: [0, [60.4, -48.5], [62.4, -58.5], 1, [59.5, -61.5], 2, [52.6, -55.3], 3],
  },
  {
    id: 'zheng-he', deaths: [{ stop: 7, who: 'Zheng He', text: 'Zheng He is thought to have died on the voyage home in 1433, probably near Calicut, and to have been buried at sea.' }], voyager: 'Zheng He', short: 'Zheng He', title: 'The Treasure Fleet', years: '1431 – 1433', year: 1431,
    flag: 'cn', sailedFor: 'Ming China', ships: '~100, incl. giant treasure ships', crew: '~27,000', color: '#f87171',
    tagline: 'The greatest fleet of its age crosses the Indian Ocean',
    story: 'Admiral Zheng He led seven vast expeditions for the Ming emperors. On the last, his fleet carried envoys and gifts to more than twenty kingdoms — Java, Malacca, Sri Lanka, Calicut, Hormuz — while smaller squadrons reached Mecca and the coast of East Africa.',
    mattered: [
      'Fleets of hundreds of ships and tens of thousands of men, decades before Europe’s voyages of discovery.',
      'Spread Ming trade and prestige across Asia and Africa — then China turned inward and the fleets never sailed again.',
    ],
    life: '1371 – 1433',
    bio: 'Born Ma He into a Muslim family in Yunnan, he was captured as a boy by Ming armies and served the prince who became the Yongle Emperor, rising to become his most trusted admiral. He died during the last voyage, probably on the way home from India.',
    wiki: 'Zheng_He',
    stops: [
      { name: 'Liujiagang, near Nanjing', at: [31.6, 121.25], when: 'Jan 1431', note: 'The fleet gathers at the mouth of the Yangtze.' },
      { name: 'Changle, Fujian', at: [25.96, 119.62], when: '1431', note: 'Waits for the winter monsoon winds to carry it south.' },
      { name: 'Champa (Qui Nhơn)', at: [13.77, 109.25], when: '1432', note: 'The kingdom of Champa, in today’s Vietnam — the first foreign port.' },
      { name: 'Surabaya, Java', at: [-7.2, 112.75], when: '1432', note: 'Trade with the Majapahit kingdom of Java.' },
      { name: 'Malacca', at: [2.19, 102.25], when: '1432', note: 'Zheng He’s great base and warehouse on the Strait of Malacca.' },
      { name: 'Semudera, Sumatra', at: [5.25, 97.2], when: '1432', note: 'The gateway out of the strait into the Indian Ocean.' },
      { name: 'Galle, Sri Lanka', at: [6.03, 80.22], when: '1432', note: 'Earlier, Zheng He left a stone here inscribed in Chinese, Tamil and Persian.' },
      { name: 'Calicut, India', at: [11.25, 75.75], when: '1432', note: 'The great pepper port of the Malabar coast.' },
      { name: 'Hormuz', at: [27.1, 56.45], when: '1433', note: 'Gateway to the Persian Gulf; squadrons sailed on to Aden, Mecca and Malindi.' },
    ],
    route: [0, [29, 123], 1, [22, 117.5], [16, 111.5], 2, [8, 108], [0, 108.2], [-4.5, 111.5], [-6.7, 112.9], 3, [-5.6, 110], [-3.3, 106.5], [-1.5, 105.6], [0.8, 104.6], [1.25, 103.8], 4, [4, 99.6], 5, [6.2, 94.5], 6, [7.6, 76.8], 7, [15, 71.5], [20.5, 64], [24.5, 59], [26.4, 56.9], 8],
  },
  {
    id: 'bartolomeu-dias', voyager: 'Bartolomeu Dias', short: 'Dias', title: 'Round the tip of Africa', years: '1487 – 1488', year: 1487,
    flag: 'pt', sailedFor: 'Portugal', ships: '2 caravels + a supply ship', crew: '~60', color: '#fb923c',
    tagline: 'The first sailor round the southern tip of Africa',
    story: 'King John II sent Dias to find where Africa ended. Off Namibia a storm drove his ships south for thirteen days. Turning back north, he found the coast now ran east: he had rounded Africa without seeing it, and saw the great cape only on his way home.',
    mattered: [
      'Proved the Atlantic and Indian Oceans meet — opening the sea route to Asia.',
      'Dias called it the Cape of Storms; the king renamed it the Cape of Good Hope.',
    ],
    life: 'c. 1450 – 1500',
    bio: 'A Portuguese nobleman and navigator. He later helped design the ships for Vasco da Gama, and sailed with Cabral’s fleet to Brazil — where he was lost in a storm near the very cape he had found.',
    wiki: 'Bartolomeu_Dias',
    stops: [
      { name: 'Lisbon', at: [38.69, -9.25], when: 'Aug 1487', note: 'Sets out with two caravels and a store ship.' },
      { name: 'Angra Pequena (Lüderitz)', at: [-26.65, 15.1], when: 'Dec 1487', note: 'Raises a stone cross (padrão) on the Namibian coast.' },
      { name: 'Mossel Bay', at: [-34.18, 22.2], when: 'Feb 1488', note: 'After the storm, the first landing east of the Cape — Europeans meet the Khoikhoi.' },
      { name: 'Kwaaihoek', at: [-33.72, 26.65], when: 'Mar 1488', note: 'The crew insists on turning back. Dias leaves his last cross here.' },
      { name: 'Cape of Good Hope', at: [-34.36, 18.47], when: 'May 1488', note: 'Seen for the first time — on the way home.' },
      { name: 'Lisbon', at: [38.69, -9.25], when: 'Dec 1488', note: 'Home after sixteen months.' },
    ],
    route: [0, [35, -12], [26, -16.8], [20, -18.2], [14.7, -18.2], [9, -16.5], [4, -9], [2, 0], [-5, 10.5], [-12, 12.3], [-20, 11.8], 1, [-33, 14], [-38, 17], [-38, 21], 2, [-34.4, 25], 3, [-34.6, 24.5], [-35.2, 20], 4, [-30, 14.5], [-20, 10], [-10, 3], [0, -10], [10, -22], [25, -21], [36, -13], 5],
  },
  {
    id: 'columbus', voyager: 'Christopher Columbus', short: 'Columbus', title: 'Across the Atlantic', years: '1492 – 1493', year: 1492,
    flag: 'es', sailedFor: 'Spain', ships: 'Santa María, Pinta, Niña', crew: '~90', color: '#facc15',
    tagline: 'Sailing west for Asia, he reaches the Caribbean',
    story: 'Convinced he could reach Asia by sailing west, Columbus won the backing of Ferdinand and Isabella of Spain. After 33 days out from the Canary Islands he reached an island in the Bahamas, then Cuba and Hispaniola — certain, to his death, that he was near the Indies.',
    mattered: [
      'Began lasting contact between Europe and the Americas — the “Columbian Exchange” of crops, animals, people and disease.',
      'Opened the way to conquest and colonisation, with devastating consequences for the Taíno and other Indigenous peoples.',
    ],
    life: '1451 – 1506',
    bio: 'A sailor from Genoa who made four voyages to the Americas for Spain. Made governor of Hispaniola, he was removed for harsh rule and sent home in chains. He died in Valladolid, still believing he had found a route to Asia.',
    wiki: 'Christopher_Columbus',
    stops: [
      { name: 'Palos de la Frontera', at: [37.2, -6.95], when: '3 Aug 1492', note: 'Three ships leave the little Andalusian port.' },
      { name: 'La Gomera, Canary Islands', at: [28.09, -17.11], when: '6 Sep 1492', note: 'Last fresh water and repairs before the open ocean.' },
      { name: 'San Salvador, Bahamas', at: [24.05, -74.45], when: '12 Oct 1492', note: '“Land! Land!” — the first landfall in the Americas, on an island the Taíno called Guanahaní.' },
      { name: 'Cuba', at: [21.25, -76.0], when: '28 Oct 1492', note: 'Columbus thinks it may be part of mainland Asia.' },
      { name: 'Hispaniola (La Navidad)', at: [19.8, -72.2], when: 'Dec 1492', note: 'The Santa María runs aground on Christmas Eve; 39 men stay behind in a fort built from her timbers.' },
      { name: 'Azores', at: [36.97, -25.15], when: 'Feb 1493', note: 'Battered by storms on the way home.' },
      { name: 'Lisbon', at: [38.69, -9.25], when: '4 Mar 1493', note: 'Driven into Lisbon by a storm, he tells the Portuguese king what he found.' },
      { name: 'Palos de la Frontera', at: [37.2, -6.95], when: '15 Mar 1493', note: 'Home, seven and a half months after leaving.' },
    ],
    route: [0, [36.2, -7.6], [33, -12], 1, [28, -30], [26.5, -50], [25, -68], 2, [23.4, -75.3], 3, [20.5, -74.3], 4, [20.5, -70], [25, -65], [33, -50], [37.2, -30], 5, [38.5, -14], 6, [37, -9.3], [36.6, -7.6], 7],
  },
  {
    id: 'vasco-da-gama', voyager: 'Vasco da Gama', short: 'da Gama', title: 'The sea route to India', years: '1497 – 1499', year: 1497,
    flag: 'pt', sailedFor: 'Portugal', ships: 'São Gabriel, São Rafael, Berrio + a store ship', crew: '~170 (about 55 came home)', color: '#34d399',
    tagline: 'The first sea route from Europe to India',
    story: 'Following Dias, da Gama swung far out into the South Atlantic — three months out of sight of land — to catch the winds round the Cape, then sailed up the coast of East Africa. At Malindi he took on a pilot who guided him across the Indian Ocean to Calicut.',
    mattered: [
      'Linked Europe and Asia by sea, ending the overland monopoly on the spice trade.',
      'Founded a Portuguese trading empire across the Indian Ocean that lasted centuries.',
    ],
    life: 'c. 1460 – 1524',
    bio: 'A Portuguese nobleman from Sines. He sailed to India twice more; on the third voyage he arrived as Viceroy of India and died in Cochin a few weeks later.',
    wiki: 'Vasco_da_Gama',
    stops: [
      { name: 'Lisbon', at: [38.69, -9.25], when: '8 Jul 1497', note: 'Four ships leave from Belém.' },
      { name: 'Cape Verde Islands', at: [14.92, -23.51], when: 'Jul 1497', note: 'Last stop before the great loop through the South Atlantic.' },
      { name: 'St Helena Bay', at: [-32.75, 17.95], when: 'Nov 1497', note: 'First land in 93 days — then a skirmish with the Khoikhoi.' },
      { name: 'Cape of Good Hope', at: [-34.36, 18.47], when: '22 Nov 1497', note: 'Rounded after days of fighting the winds.' },
      { name: 'Mozambique Island', at: [-15.03, 40.73], when: 'Mar 1498', note: 'The first Swahili trading town — rich with Arab and Indian merchants.' },
      { name: 'Mombasa', at: [-4.06, 39.68], when: 'Apr 1498', note: 'A hostile welcome; the fleet slips away at night.' },
      { name: 'Malindi', at: [-3.22, 40.12], when: 'Apr 1498', note: 'A friendly sultan provides a pilot who knows the monsoon route to India.' },
      { name: 'Calicut, India', at: [11.25, 75.75], when: '20 May 1498', note: 'Arrives at the spice port after 23 days crossing the Indian Ocean.' },
    ],
    route: [0, [33, -13], [27.5, -17], [20, -20.5], 1, [5, -22], [-10, -25], [-22, -22], [-30, -10], [-33, 5], 2, [-34.6, 18.3], 3, [-35.2, 20], [-34.4, 22.4], [-34.4, 25.5], [-33, 28.5], [-30, 31.5], [-25.5, 34.5], [-22, 36], [-18.5, 37.5], 4, [-10, 41], [-6, 40], 5, 6, [2, 50], [8, 62], [11.4, 74], 7],
  },
  {
    id: 'vespucci', voyager: 'Amerigo Vespucci', short: 'Vespucci', title: 'A New World', years: '1501 – 1502', year: 1501,
    flag: 'pt', sailedFor: 'Portugal', ships: '3 caravels', crew: '~100', color: '#c084fc',
    tagline: 'The voyage that gave America its name',
    story: 'Sailing for Portugal, Vespucci followed the coast of Brazil far to the south. The land went on and on — far too long to be a corner of Asia — and he wrote that it must be a “New World”.',
    mattered: [
      'His letter “Mundus Novus” spread the idea that the Americas were a continent of their own.',
      'In 1507 the mapmaker Martin Waldseemüller named it “America”, after Amerigo.',
    ],
    life: '1454 – 1512',
    bio: 'A merchant from Florence who turned to navigation. He later became Spain’s first Pilot Major in Seville, training and examining the pilots who sailed to the Americas.',
    wiki: 'Amerigo_Vespucci',
    stops: [
      { name: 'Lisbon', at: [38.69, -9.25], when: 'May 1501', note: 'Three caravels leave for the land Cabral had found the year before.' },
      { name: 'Bezeguiche (Dakar)', at: [14.67, -17.45], when: 'Jun 1501', note: 'Meets Cabral’s fleet returning from India and hears of its voyage.' },
      { name: 'Cape São Roque, Brazil', at: [-5.45, -35.2], when: 'Aug 1501', note: 'Landfall on the north-east corner of Brazil.' },
      { name: 'Bay of All Saints', at: [-12.95, -38.55], when: 'Nov 1501', note: 'Named on All Saints’ Day — today’s Salvador.' },
      { name: 'Guanabara Bay (Rio de Janeiro)', at: [-22.93, -43.15], when: 'Jan 1502', note: 'Reached in January: the bay was later named “River of January”.' },
      { name: 'The far south', at: [-47, -62], when: 'Early 1502', note: 'Vespucci wrote they sailed to about 50°S; historians still debate how far south they really went.' },
      { name: 'Lisbon', at: [38.69, -9.25], when: 'Jul 1502', note: 'Home via Sierra Leone and the Azores.' },
    ],
    route: [0, [33, -13], [26, -16.8], 1, [5, -25], 2, [-8.5, -34.5], [-11.5, -37], 3, [-17, -38.5], [-21, -40.2], [-23.1, -42.5], 4, [-24.2, -45.5], [-26, -47.8], [-30, -48.5], [-36, -53.5], 5, [-30, -30], [-10, -20], [8.2, -14.2], [20, -25], [37.5, -25.5], 6],
  },
  {
    id: 'magellan-elcano', focus: [-15, -75], deaths: [{ stop: 5, who: 'Ferdinand Magellan', text: 'Magellan is killed in battle on Mactan, 27 April 1521, by warriors of the chief Lapulapu. Elcano later takes command of the Victoria.' }], voyager: 'Ferdinand Magellan & Juan Sebastián Elcano', short: 'Magellan', title: 'First voyage around the world', years: '1519 – 1522', year: 1519,
    flag: 'es', sailedFor: 'Spain', ships: '5 ships — only the Victoria returned', crew: '~270 (18 came home)', color: '#38bdf8',
    tagline: 'The first voyage all the way around the world',
    story: 'Magellan, a Portuguese captain sailing for Spain, set out to reach the Spice Islands by sailing west. He found a passage through the tip of South America and crossed the vast Pacific — then was killed in the Philippines. Juan Sebastián Elcano brought the last ship, the Victoria, home.',
    mattered: [
      'The first circumnavigation of the Earth — revealing how vast the Pacific, and the planet, really are.',
      'Of about 270 men who set out, just 18 made it back three years later.',
    ],
    life: 'Magellan c. 1480 – 1521 · Elcano 1486 – 1526',
    bio: 'Magellan was a Portuguese noble who had fought in India and Malacca. Turned down at home, he sailed for Spain’s young King Charles I. The strait at the tip of South America bears his name. Elcano, a Basque navigator, completed the voyage and died on a second Pacific expedition.',
    wiki: 'Ferdinand_Magellan',
    stops: [
      { name: 'Sanlúcar de Barrameda', at: [36.78, -6.36], when: '20 Sep 1519', note: 'Five ships leave the mouth of the Guadalquivir.' },
      { name: 'Rio de Janeiro', at: [-22.93, -43.15], when: 'Dec 1519', note: 'Two weeks of rest and trade on the Brazilian coast.' },
      { name: 'Puerto San Julián', at: [-49.3, -67.65], when: 'Mar – Aug 1520', note: 'Winter in Patagonia — a mutiny is crushed and one ship is wrecked.' },
      { name: 'Strait of Magellan', at: [-53.1, -70.8], when: 'Oct – Nov 1520', note: '38 days threading the strait; one ship deserts and sails home.' },
      { name: 'Guam', at: [13.44, 144.7], when: '6 Mar 1521', note: 'After 99 days across the Pacific — the crew starving and sick with scurvy.' },
      { name: 'Mactan, Philippines', at: [10.3, 124.0], when: '27 Apr 1521', note: 'Magellan is killed fighting the warriors of the chief Lapulapu.' },
      { name: 'Tidore, Moluccas', at: [0.68, 127.38], when: 'Nov 1521', note: 'At last, the Spice Islands: the ships load cloves.' },
      { name: 'Cape of Good Hope', at: [-34.6, 18.4], when: 'May 1522', note: 'Elcano takes the Victoria home the long way, avoiding Portuguese ports.' },
      { name: 'Sanlúcar de Barrameda', at: [36.78, -6.36], when: '6 Sep 1522', note: 'Eighteen men on one battered ship complete the first voyage around the world.' },
    ],
    route: [0, [35, -9], [30, -14], [28.6, -16.0], [20, -22], [5, -28], [-8, -33.5], [-15, -37], [-21, -39.5], 1, [-27, -46], [-33, -51], [-35.1, -55.8], [-38, -56], [-42, -61.5], [-46, -65.5], 2, [-51.5, -68], [-52.4, -68.3], [-52.55, -69.5], 3, [-53.8, -71.1], [-53.4, -72.4], [-52.8, -73.8], [-52.7, -74.8], [-45, -80], [-30, -90], [-15, -115], [0, -145], [12, 170], 4, [12, 128], [10.2, 125.3], 5, [8.5, 121.5], [6.5, 118], [5.2, 115], [5.5, 120.5], [3.5, 124.5], 6, [-3.5, 127], [-8.6, 125.5], [-10.5, 123.5], [-20, 105], [-32, 60], [-36.5, 25], 7, [-25, 9], [-5, -5], [14.9, -23.7], [28, -20], [35, -11], 8],
  },
  {
    id: 'abel-tasman', focus: [-22, 150], voyager: 'Abel Tasman', short: 'Tasman', title: 'In search of the Southern Land', years: '1642 – 1643', year: 1642,
    flag: 'nl', sailedFor: 'Dutch East India Company', ships: 'Heemskerck, Zeehaen', crew: '~110', color: '#f97316',
    tagline: 'Tasmania, New Zealand and Fiji — and right round Australia',
    story: 'The Dutch East India Company sent Tasman to find the great “Southern Land”. Sailing far south from Mauritius, he found Tasmania and the west coast of New Zealand, then Tonga and Fiji — circling Australia without ever seeing it.',
    mattered: [
      'The first Europeans to reach Tasmania, New Zealand and Fiji.',
      'Showed that Australia was not joined to a vast polar continent.',
    ],
    life: '1603 – 1659',
    bio: 'A Dutch seafarer from Lutjegast in Groningen who served the Dutch East India Company in Batavia. Tasmania, the Tasman Sea and Abel Tasman National Park are named after him.',
    wiki: 'Abel_Tasman',
    stops: [
      { name: 'Batavia (Jakarta)', at: [-6.1, 106.8], when: 'Aug 1642', note: 'Two ships leave the Company’s Asian headquarters.' },
      { name: 'Mauritius', at: [-20.16, 57.5], when: 'Sep 1642', note: 'Supplies and timber before heading into the Roaring Forties.' },
      { name: 'Van Diemen’s Land (Tasmania)', at: [-42.9, 148.0], when: 'Nov 1642', note: 'Named for the Company’s governor-general; later renamed for Tasman.' },
      { name: 'Golden Bay, New Zealand', at: [-40.75, 172.9], when: 'Dec 1642', note: 'A deadly clash with Māori — the first meeting of Europeans and Māori.' },
      { name: 'Tonga', at: [-21.15, -175.2], when: 'Jan 1643', note: 'A warm welcome on Tongatapu.' },
      { name: 'Fiji', at: [-16.6, 179.9], when: 'Feb 1643', note: 'The ships narrowly escape the reefs of Fiji.' },
      { name: 'Batavia', at: [-6.1, 106.8], when: 'Jun 1643', note: 'Home along the north coast of New Guinea, ten months later.' },
    ],
    route: [0, [-5.9, 106], [-6.6, 105], [-15, 90], 1, [-45, 80], [-49, 120], [-44.5, 145], 2, [-41.5, 160], 3, [-38, 173.5], [-34.2, 172.1], [-28, -178], 4, 5, [-5.4, 159.4], [-3, 152.5], [-2.5, 149], [-2.2, 141], [-0.3, 130.8], [-3.3, 128.5], [-5, 124], [-5.5, 112], 6],
  },
  {
    id: 'james-cook', focus: [-25, 170], voyager: 'James Cook', short: 'Cook', title: 'The voyage of the Endeavour', years: '1768 – 1771', year: 1768,
    flag: 'gb', sailedFor: 'Great Britain', ships: 'HMS Endeavour', crew: '94', color: '#e879f9',
    tagline: 'Charting New Zealand and the east coast of Australia',
    story: 'Cook sailed to Tahiti to watch Venus cross the face of the Sun, then opened secret orders to search for a great southern continent. He charted the whole coast of New Zealand and became the first European to reach Australia’s east coast — almost sinking on the Great Barrier Reef.',
    mattered: [
      'Mapped New Zealand and eastern Australia with remarkable accuracy.',
      'Led to British colonisation of Australia, with lasting consequences for Aboriginal and Torres Strait Islander peoples and for Māori.',
    ],
    life: '1728 – 1779',
    bio: 'A farm labourer’s son from Yorkshire who rose from merchant seaman to Royal Navy captain. Over three voyages he charted much of the Pacific; he was killed at Kealakekua Bay in Hawaiʻi in 1779.',
    wiki: 'James_Cook',
    stops: [
      { name: 'Plymouth', at: [50.33, -4.14], when: '26 Aug 1768', note: 'Endeavour sails with astronomers and the botanist Joseph Banks.' },
      { name: 'Rio de Janeiro', at: [-22.93, -43.15], when: 'Nov 1768', note: 'The suspicious Portuguese viceroy keeps the crew aboard.' },
      { name: 'Cape Horn', at: [-56.2, -67.3], when: 'Jan 1769', note: 'Round the Horn into the Pacific.' },
      { name: 'Tahiti', at: [-17.45, -149.48], when: 'Apr 1769', note: 'The transit of Venus is observed on 3 June 1769.' },
      { name: 'Poverty Bay, New Zealand', at: [-38.7, 178.1], when: 'Oct 1769', note: 'First landing; Cook then charts both islands in six months.' },
      { name: 'Botany Bay', at: [-34.0, 151.25], when: 'Apr 1770', note: 'First landing on Australia’s east coast, at Kamay.' },
      { name: 'Endeavour River (Cooktown)', at: [-15.46, 145.27], when: 'Jun 1770', note: 'Holed on the Great Barrier Reef; seven weeks of repairs ashore.' },
      { name: 'Batavia (Jakarta)', at: [-6.1, 106.8], when: 'Oct 1770', note: 'Repairs — but malaria and dysentery kill about 30 of the crew.' },
      { name: 'Cape Town', at: [-33.9, 18.42], when: 'Mar 1771', note: 'On the way home round Africa.' },
      { name: 'Deal, England', at: [51.22, 1.43], when: '12 Jul 1771', note: 'Home after almost three years.' },
    ],
    route: [0, [48, -8], [40, -14], [32.4, -17.2], [20, -24], [0, -30], [-10, -33.5], [-20, -38.5], 1, [-30, -46], [-40, -55], [-50, -63], [-54.9, -65.3], 2, [-55, -80], [-40, -110], [-25, -135], 3, [-20, -160], [-30, -172], 4, [-37.5, 178.8], [-35.2, 174.6], [-34.2, 172.9], [-38, 173.9], [-41.2, 174.5], [-45, 166], [-47.6, 167.8], [-46.5, 170.5], [-43.8, 173.5], [-40.4, 172.2], [-39, 165], [-36, 155], 5, [-30, 153.8], [-25, 153.6], [-21, 150.5], [-19, 147.5], [-16.8, 146], 6, [-12, 143.6], [-10.6, 142.2], [-10.3, 141.4], [-9.5, 136], [-10.8, 128], [-10.4, 120.5], [-9, 116], [-7.6, 106], [-6, 105.7], 7, [-6.6, 105], [-12, 95], [-25, 60], [-34.6, 25], 8, [-25, 8], [-15.9, -5.9], [0, -18], [20, -28], [40, -22], [49, -7], [49.8, -5.3], [50.4, -1.5], [50.9, 1.3], 9],
  },
  {
    id: 'darwin-beagle', focus: [-25, -65], voyager: 'Charles Darwin & HMS Beagle', short: 'Darwin', title: 'The voyage of the Beagle', years: '1831 – 1836', year: 1831,
    flag: 'gb', sailedFor: 'Great Britain', ships: 'HMS Beagle, Capt. Robert FitzRoy', crew: '74', color: '#4ade80',
    tagline: 'Five years around the world that led to the theory of evolution',
    story: 'A five-year survey voyage around the world, with 22-year-old Charles Darwin aboard as naturalist. He dug up giant fossils in Argentina, lived through an earthquake in Chile and studied the finches, mockingbirds and tortoises of the Galápagos.',
    mattered: [
      'Darwin’s notes and specimens led to “On the Origin of Species” (1859) and the theory of evolution by natural selection.',
      'FitzRoy’s charts of South America’s coasts were used for a century.',
    ],
    life: '1809 – 1882',
    bio: 'A doctor’s son from Shrewsbury who abandoned medicine for natural history. After the Beagle he never left Britain again, working for decades at Down House in Kent on the ideas that changed biology.',
    wiki: 'Charles_Darwin',
    stops: [
      { name: 'Plymouth', at: [50.33, -4.14], when: '27 Dec 1831', note: 'The Beagle sails after weeks of storms; Darwin is seasick for days.' },
      { name: 'Cape Verde Islands', at: [14.92, -23.51], when: 'Jan 1832', note: 'Darwin’s first look at volcanic islands — and his first geology.' },
      { name: 'Bahia (Salvador)', at: [-12.95, -38.55], when: 'Feb 1832', note: 'The rainforest amazes him; slavery appals him.' },
      { name: 'Rio de Janeiro', at: [-22.93, -43.15], when: 'Apr 1832', note: 'Months collecting while the Beagle surveys the coast.' },
      { name: 'Montevideo', at: [-34.95, -56.2], when: '1832 – 1833', note: 'Base for surveying the Plata; Darwin rides with gauchos and finds giant fossils.' },
      { name: 'Falkland Islands', at: [-51.68, -57.75], when: 'Mar 1833', note: 'Surveying the islands Britain had just occupied.' },
      { name: 'Tierra del Fuego', at: [-54.9, -68.0], when: '1833', note: 'The Beagle Channel, named after the ship on her first voyage.' },
      { name: 'Valparaíso', at: [-33.02, -71.65], when: '1834 – 1835', note: 'Darwin crosses the Andes and feels the 1835 Chile earthquake.' },
      { name: 'Galápagos Islands', at: [-0.9, -89.5], when: 'Sep – Oct 1835', note: 'Five weeks among tortoises and finches that differ from island to island.' },
      { name: 'Tahiti', at: [-17.45, -149.48], when: 'Nov 1835', note: 'Darwin studies coral reefs.' },
      { name: 'Sydney', at: [-33.84, 151.28], when: 'Jan 1836', note: 'He finds the platypus strange enough to wonder about two Creators.' },
      { name: 'Cape Town', at: [-33.9, 18.42], when: 'Jun 1836', note: 'Meets the astronomer John Herschel.' },
      { name: 'Falmouth', at: [50.15, -5.05], when: '2 Oct 1836', note: 'Home after four years and nine months.' },
    ],
    route: [0, [46, -10], [33, -17.5], [20, -22], 1, [0, -31], [-8, -33.5], 2, [-17, -38.5], [-21, -40.2], 3, [-27, -46], [-33, -51], 4, [-38, -56], [-45, -62], 5, [-54, -63], [-55.2, -65.5], 6, [-55.6, -67.5], [-55.2, -72], [-50, -76.5], [-40, -74.8], 7, [-25, -71.5], [-18, -71.5], [-12.1, -77.3], 8, 9, [-25, -170], [-35.2, 174.4], [-34.5, 165], 10, [-38.5, 150.5], [-43.2, 147.6], [-44, 146], [-40, 135], [-36, 120], [-35.2, 117.9], [-12.1, 96.9], [-20.1, 57.5], [-30, 40], [-35.2, 22], 11, [-15.95, -5.7], [-7.93, -14.35], [-13.1, -38.3], [-5, -34.4], [10, -30], [38.5, -27.5], 12],
  },
  {
    id: 'amundsen', voyager: 'Roald Amundsen', short: 'Amundsen', title: 'Through the Northwest Passage', years: '1903 – 1906', year: 1903,
    flag: 'no', sailedFor: 'Norway', ships: 'Gjøa, a 70-foot herring boat', crew: '7', color: '#a5f3fc',
    tagline: 'The first ship through the Arctic’s Northwest Passage',
    story: 'In a small herring boat, Amundsen and six men picked their way through the maze of Arctic islands north of Canada. They spent two winters at Gjoa Haven, learning to live in the cold from the Netsilik Inuit, and reached Alaska in 1906.',
    mattered: [
      'The first voyage through the Northwest Passage, sought by sailors for 400 years.',
      'The Inuit skills he learned — dogs, furs, igloos — helped him reach the South Pole first in 1911.',
    ],
    life: '1872 – 1928',
    bio: 'A Norwegian polar explorer: first to sail the Northwest Passage, first to the South Pole (1911), and first proven to reach both poles. He disappeared in 1928 flying to rescue the Italian explorer Umberto Nobile.',
    wiki: 'Roald_Amundsen',
    stops: [
      { name: 'Kristiania (Oslo)', at: [59.9, 10.73], when: 'Jun 1903', note: 'Slips out at night — partly to dodge a creditor.' },
      { name: 'Godhavn, Greenland', at: [69.24, -53.6], when: 'Jul 1903', note: 'Takes on sled dogs and supplies.' },
      { name: 'Beechey Island', at: [74.7, -91.6], when: 'Aug 1903', note: 'Where Franklin’s lost expedition spent its first winter.' },
      { name: 'Gjoa Haven', at: [68.63, -95.88], when: '1903 – 1905', note: 'Two winters in a sheltered harbour among the Netsilik Inuit.' },
      { name: 'Herschel Island', at: [69.58, -139.0], when: '1905 – 1906', note: 'Frozen in for a third winter; Amundsen skis 800 km to send a telegram.' },
      { name: 'Nome, Alaska', at: [64.45, -165.4], when: '31 Aug 1906', note: 'The passage is complete — the town greets them with a party.' },
    ],
    route: [0, [58, 7], [59.6, -1], [60, -10], [59.3, -44], [64, -54.5], 1, [74.5, -62], [74.3, -80.5], 2, [73, -96.3], [71, -96.3], [69.8, -96.5], 3, [68.5, -97.5], [68.4, -101], [68.8, -106.5], [68.2, -112], [69, -115.5], [70.5, -123.5], [70, -130], 4, [71.6, -156.3], [68, -168], [65.5, -168.6], 5],
  },
];

/** Oldest first: the timeline. */
export const VOYAGES = [...LIST, ...MORE].sort((a, b) => a.year - b.year);
export const BY_VOYAGE = new Map(VOYAGES.map((v) => [v.id, v]));

/** The full path as points (stops filled in). */
export const routePoints = (v: Voyage): LL[] => v.route.map((p) => (typeof p === 'number' ? v.stops[p].at : p));

const rad = (d: number) => (d * Math.PI) / 180;
/** Great-circle distance in km. */
export function km([a1, o1]: LL, [a2, o2]: LL) {
  const h = Math.sin(rad(a2 - a1) / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(rad(o2 - o1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Roughly how far the voyage sailed (along the drawn route). */
export const voyageKm = (v: Voyage) => { const p = routePoints(v); let d = 0; for (let i = 1; i < p.length; i++) d += km(p[i - 1], p[i]); return d; };

/** Where to point the camera to see the whole route: its centre, and how far out. */
export function routeView(v: Voyage) {
  const p = routePoints(v);
  let x = 0, y = 0, z = 0;
  for (const [la, lo] of p) { x += Math.cos(rad(la)) * Math.cos(rad(lo)); y += Math.cos(rad(la)) * Math.sin(rad(lo)); z += Math.sin(rad(la)); }
  const [lat, lng] = v.focus ?? [(Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, (Math.atan2(y, x) * 180) / Math.PI];
  const spread = Math.max(...p.map((q) => km([lat, lng], q))) / 111; // degrees from the centre
  return { lat, lng, altitude: Math.min(3.2, Math.max(0.9, 0.4 + spread / 22)) };
}
