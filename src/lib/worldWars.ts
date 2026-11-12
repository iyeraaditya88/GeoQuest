// The two world wars as timelines: each event says what happened, where to look, which armies moved
// and which countries changed hands. The map is the sum of the events so far (see warMapAt). It uses
// today's countries, so a fill is approximate: empires that are gone show as the lands they held.
import type { LL } from './battles.js';

export type WarStatus = 'allies' | 'enemy' | 'held' | 'out' | null;
export interface WarMove { f: LL; t: LL; s: 'allies' | 'enemy' }
export interface WarEvent {
  m: number;          // months since the war began
  date: string;
  title: string;
  text: string;
  at: LL;
  alt: number;        // camera height
  moves?: WarMove[];
  fronts?: LL[][];    // a front line, while this event shows
  to?: Partial<Record<Exclude<WarStatus, null> | 'none', string[]>>; // who changes, and to what
  /** Countries worth naming in the "joined" chips: the rest of a big empire goes uncounted. */
  major?: string[];
}
export interface WorldWar {
  id: 'ww1' | 'ww2';
  name: string;
  years: string;
  line: string;
  labels: { allies: string; enemy: string; held: string; out: string };
  colors: { allies: string; enemy: string; held: string; out: string };
  months: number;
  ticks: { m: number; label: string }[];
  toll: string;
  tollNote: string;
  mapNote: string;
  ended: string;
  wiki: string;
  start: Partial<Record<Exclude<WarStatus, null>, string[]>>;
  events: WarEvent[];
}

const BRITISH_DOMINIONS = ['CAN', 'AUS', 'NZL', 'ZAF'];
const BRITISH_ASIA = ['IND', 'PAK', 'BGD', 'MMR', 'LKA', 'MYS', 'SGP', 'BRN', 'NPL'];
const BRITISH_AFRICA = ['EGY', 'SDN', 'SSD', 'NGA', 'GHA', 'KEN', 'UGA', 'ZMB', 'ZWE', 'MWI', 'SLE', 'GMB', 'BWA', 'LSO', 'SWZ', 'SOM'];
const FRENCH_AFRICA = ['DZA', 'TUN', 'MAR', 'SEN', 'MLI', 'NER', 'TCD', 'BFA', 'GIN', 'CIV', 'BEN', 'MRT', 'GAB', 'COG', 'CAF', 'MDG'];
const FRENCH_ASIA = ['VNM', 'LAO', 'KHM'];
const TSARIST = ['RUS', 'FIN', 'LVA', 'LTU', 'EST', 'BLR', 'UKR', 'MDA', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'];
const HABSBURG = ['AUT', 'HUN', 'CZE', 'SVK', 'SVN', 'HRV', 'BIH'];
const OTTOMAN = ['TUR', 'SYR', 'IRQ', 'LBN', 'ISR', 'PSE', 'JOR'];
const SOVIET = ['RUS', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'];
const SOVIET_WEST = ['UKR', 'BLR', 'LVA', 'LTU', 'EST', 'MDA'];
const YUGOSLAVIA = ['SRB', 'HRV', 'BIH', 'SVN', 'MNE', 'MKD'];

export const WW1: WorldWar = {
  id: 'ww1', name: 'World War I', years: '1914 – 1918',
  line: 'Empires collide from the trenches of France to the deserts of Arabia',
  labels: { allies: 'Allied Powers', enemy: 'Central Powers', held: 'Under occupation', out: 'Out of the war' },
  colors: { allies: '#2f6fe8', enemy: '#dc3b3b', held: '#ef8a25', out: '#8a94a6' },
  months: 53,
  ticks: [{ m: 1, label: '1914' }, { m: 7, label: '1915' }, { m: 19, label: '1916' }, { m: 31, label: '1917' }, { m: 43, label: '1918' }],
  toll: '≈ 15–22 million dead',
  tollNote: 'Soldiers and civilians, not counting the flu pandemic that followed.',
  mapNote: 'Colours use today’s countries, so empires appear as the lands they once held. Colonies are coloured with their empires.',
  ended: 'Four empires fell: Germany’s, Austria-Hungary’s, Russia’s and the Ottomans’. The Treaty of Versailles in 1919 redrew the map, and left grievances that fed the next war.',
  wiki: 'World_War_I',
  start: {},
  events: [
    { m: 0, date: '28 Jun 1914', title: 'Shots in Sarajevo', text: 'A Bosnian Serb student kills Archduke Franz Ferdinand, heir to Austria-Hungary. Europe’s alliances begin to pull tight.', at: [43.86, 18.41], alt: 1.3 },
    { m: 1, date: '28 Jul 1914', title: 'Austria-Hungary attacks Serbia', text: 'Backed by Germany, Vienna declares war. Russia mobilises to defend Serbia.', at: [44.79, 20.45], alt: 1.5, moves: [{ f: [47.5, 19.05], t: [44.79, 20.45], s: 'enemy' }], to: { enemy: HABSBURG, allies: ['SRB', 'MNE'] }, major: ['AUT', 'HUN', 'SRB'] },
    { m: 2, date: 'Aug 1914', title: 'Europe goes to war', text: 'In days, Germany, Russia, France and Britain are at war. German armies sweep through neutral Belgium, and Britain’s empire joins with it.', at: [50.5, 4.5], alt: 2.3, moves: [{ f: [50.78, 6.08], t: [50.85, 4.35], s: 'enemy' }, { f: [50.85, 4.35], t: [49.5, 2.8], s: 'enemy' }, { f: [55.75, 37.62], t: [54.1, 21.9], s: 'allies' }], to: { enemy: ['DEU', 'NAM', 'TZA', 'CMR', 'TGO', 'PNG', 'BDI', 'RWA'], allies: ['GBR', 'FRA', 'IRL', 'BEL', ...TSARIST, 'POL', ...BRITISH_DOMINIONS, ...BRITISH_ASIA, ...BRITISH_AFRICA, ...FRENCH_AFRICA, ...FRENCH_ASIA] }, major: ['DEU', 'FRA', 'GBR', 'RUS', 'BEL'] },
    { m: 2.5, date: 'Aug 1914', title: 'Tannenberg', text: 'Russia marches into East Prussia and is destroyed, losing about 150,000 men. Yet it draws German troops away from the west.', at: [53.5, 20.1], alt: 1.2, moves: [{ f: [52.23, 21.01], t: [53.5, 20.1], s: 'allies' }, { f: [54.7, 20.5], t: [53.5, 20.1], s: 'enemy' }], to: { allies: ['JPN'] } },
    { m: 3, date: 'Sep 1914', title: 'The Marne, and the trenches', text: 'France and Britain stop the Germans just short of Paris. Both sides dig in, along a line from the sea to Switzerland.', at: [49.4, 3.5], alt: 1.05, moves: [{ f: [48.86, 2.35], t: [49.0, 3.3], s: 'allies' }], fronts: [[[51.15, 2.72], [50.4, 2.8], [49.5, 2.9], [49.4, 3.8], [49.2, 5.4], [48.5, 6.9], [47.6, 7.2]]], to: { held: ['BEL'] } },
    { m: 5, date: 'Nov 1914', title: 'The Ottomans join', text: 'The Ottoman Empire enters on Germany’s side, opening fronts from the Caucasus to Mesopotamia and closing the Black Sea route to Russia.', at: [39.9, 32.85], alt: 1.5, to: { enemy: OTTOMAN }, major: ['TUR'] },
    { m: 10, date: 'Apr 1915', title: 'Gallipoli', text: 'British, French and Anzac troops land to break through to Istanbul. Eight months and about 500,000 casualties later, they leave.', at: [40.3, 26.3], alt: 0.85, moves: [{ f: [39.9, 25.2], t: [40.05, 26.2], s: 'allies' }, { f: [39.9, 25.2], t: [40.24, 26.28], s: 'allies' }] },
    { m: 11, date: 'May 1915', title: 'Italy changes sides', text: 'A pre-war ally of Germany, Italy joins the Allies for promised land. The Alps become a new front.', at: [46.0, 12.5], alt: 1.2, moves: [{ f: [45.44, 12.33], t: [46.1, 13.6], s: 'allies' }], to: { allies: ['ITA'] }, major: ['ITA'] },
    { m: 16, date: 'Oct 1915', title: 'Serbia falls', text: 'Bulgaria joins the Central Powers, and Russia’s Great Retreat gives up Poland. Serbia’s army escapes over the mountains in winter.', at: [43.5, 22], alt: 1.4, moves: [{ f: [44.5, 19], t: [43.5, 20.9], s: 'enemy' }, { f: [42.7, 23.32], t: [43.3, 21.9], s: 'enemy' }], to: { enemy: ['BGR'], held: ['SRB', 'MNE', 'POL', 'LTU'] }, major: ['BGR'] },
    { m: 20, date: 'Feb 1916', title: 'Verdun', text: 'Germany attacks the French fortress to “bleed France white”. Ten months and some 700,000 casualties change almost nothing.', at: [49.16, 5.39], alt: 0.8, moves: [{ f: [49.6, 6.13], t: [49.2, 5.4], s: 'enemy' }], fronts: [[[51.15, 2.72], [50.4, 2.8], [49.5, 2.9], [49.4, 3.8], [49.2, 5.4], [48.5, 6.9], [47.6, 7.2]]] },
    { m: 24, date: 'Jun 1916', title: 'Revolt in the desert', text: 'Sharif Hussein of Mecca rises against the Ottomans, with T. E. Lawrence later at his side. Further north, Russia’s Brusilov Offensive stuns Austria-Hungary.', at: [24, 40], alt: 1.8, moves: [{ f: [21.4, 39.8], t: [28, 36.5], s: 'allies' }, { f: [50.6, 26.2], t: [49, 24.5], s: 'allies' }], to: { allies: ['SAU', 'YEM'] }, major: ['SAU'] },
    { m: 25, date: 'Jul 1916', title: 'The Somme', text: 'Nearly 20,000 British soldiers die on the first day. By November, over a million have been killed or wounded, for a few kilometres.', at: [50.01, 2.7], alt: 0.8, moves: [{ f: [49.9, 2.3], t: [50.05, 2.8], s: 'allies' }], fronts: [[[51.15, 2.72], [50.4, 2.8], [49.5, 2.9], [49.4, 3.8], [49.2, 5.4], [48.5, 6.9], [47.6, 7.2]]] },
    { m: 27, date: 'Aug – Dec 1916', title: 'Romania joins, and falls', text: 'Romania enters the war on the Allied side. Within months Bucharest has fallen.', at: [44.43, 26.1], alt: 1.2, moves: [{ f: [42.7, 23.32], t: [44.43, 26.1], s: 'enemy' }], to: { held: ['ROU'] }, major: ['ROU'] },
    { m: 34, date: 'Apr 1917', title: 'America enters', text: 'German U-boats and a secret telegram offering Mexico a US alliance bring the United States in. Fresh troops begin crossing the Atlantic. China, Siam and Brazil also join that year.', at: [38, -40], alt: 2.5, moves: [{ f: [40.7, -74], t: [47.2, -1.5], s: 'allies' }], to: { allies: ['USA', 'CUB', 'PAN', 'BRA', 'CHN', 'THA', 'GRC', 'LBR'] }, major: ['USA', 'BRA', 'CHN'] },
    { m: 41, date: 'Nov – Dec 1917', title: 'Revolution, and Jerusalem', text: 'The Bolsheviks seize power in Russia and seek peace. In the south, General Allenby’s British force takes Jerusalem from the Ottomans.', at: [45, 34], alt: 2.1, moves: [{ f: [30.04, 31.24], t: [31.77, 35.21], s: 'allies' }], to: { held: ['ISR', 'PSE'] } },
    { m: 44, date: 'Mar 1918', title: 'Russia quits, Germany gambles', text: 'At Brest-Litovsk, Russia gives up vast lands. With troops freed from the east, Germany throws everything into a spring offensive in France.', at: [50, 12], alt: 2, moves: [{ f: [50.2, 3.2], t: [49.6, 2.5], s: 'enemy' }, { f: [50.5, 3.3], t: [49.9, 2.3], s: 'enemy' }], fronts: [[[51.15, 2.72], [50.4, 2.5], [49.7, 2.3], [49.2, 3.4], [49.2, 5.4], [48.5, 6.9], [47.6, 7.2]]], to: { out: ['RUS', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'], held: ['UKR', 'BLR', 'LVA', 'EST', 'FIN'] }, major: ['RUS'] },
    { m: 49, date: 'Aug 1918', title: 'The Hundred Days', text: 'At Amiens, Allied tanks, aircraft and infantry break the German line. It is the beginning of a rolling advance that doesn’t stop until the end of the war.', at: [49.9, 2.6], alt: 0.95, moves: [{ f: [49.9, 2.3], t: [50.3, 3.5], s: 'allies' }, { f: [49.2, 4.4], t: [49.7, 5], s: 'allies' }] },
    { m: 51, date: 'Sep – Nov 1918', title: 'The Central Powers crumble', text: 'Bulgaria surrenders, the Ottomans follow, and Austria-Hungary falls apart into new nations. Germany stands alone.', at: [44, 23], alt: 2, to: { out: ['BGR', 'TUR', 'AUT', 'HUN'], allies: ['SRB', 'ROU', 'CZE', 'SVK', 'SYR', 'IRQ', 'LBN', 'JOR', 'ISR', 'PSE'], none: ['SVN', 'HRV', 'BIH'] } },
    { m: 53, date: '11 Nov 1918', title: 'The Armistice', text: 'At the eleventh hour of the eleventh day of the eleventh month, the guns fall silent. The Kaiser has fled and Germany is a republic.', at: [49.42, 2.91], alt: 2.3, to: { out: ['DEU', 'NAM', 'TZA', 'CMR', 'TGO', 'PNG', 'BDI', 'RWA'], allies: ['BEL', 'POL', 'LTU', 'MNE'], none: ['UKR', 'BLR', 'LVA', 'EST', 'FIN'] }, major: ['DEU'] },
  ],
};

export const WW2: WorldWar = {
  id: 'ww2', name: 'World War II', years: '1939 – 1945',
  line: 'The deadliest war in history, on every ocean and most continents',
  labels: { allies: 'Allies', enemy: 'Axis', held: 'Axis-occupied', out: 'Defeated' },
  colors: { allies: '#2f6fe8', enemy: '#dc3b3b', held: '#ef8a25', out: '#8a94a6' },
  months: 72,
  ticks: [{ m: 4, label: '1940' }, { m: 16, label: '1941' }, { m: 28, label: '1942' }, { m: 40, label: '1943' }, { m: 52, label: '1944' }, { m: 64, label: '1945' }],
  toll: '≈ 70–85 million dead',
  tollNote: 'About 3% of the world’s people, most of them civilians, including 6 million Jews murdered in the Holocaust.',
  mapNote: 'Colours use today’s countries, so empires and split countries are approximate: occupied France, for example, fills all of France. Colonies are coloured with their empires.',
  ended: 'Germany and Japan lay in ruins, and Europe’s empires were fatally weakened. The US and the USSR emerged as superpowers, and the United Nations was founded in the hope of keeping the peace.',
  wiki: 'World_War_II',
  start: { enemy: ['DEU', 'AUT', 'CZE', 'SVK', 'JPN', 'KOR', 'PRK', 'TWN'], allies: ['CHN', 'POL'] },
  events: [
    { m: 0, date: '1 Sep 1939', title: 'Germany invades Poland', text: 'Tanks and dive-bombers smash across the border. Japan has already been at war with China for two years.', at: [52.2, 19], alt: 1.3, moves: [{ f: [52.5, 13.4], t: [52.23, 21], s: 'enemy' }, { f: [54.35, 18.65], t: [52.5, 20.5], s: 'enemy' }, { f: [49.8, 18.2], t: [51, 20.5], s: 'enemy' }], major: ['DEU', 'POL'] },
    { m: 0.2, date: '3 Sep 1939', title: 'Britain and France declare war', text: 'Their empires come in with them. Then, under a secret pact with Hitler, the USSR invades Poland from the east, and later attacks Finland.', at: [48, 10], alt: 2.3, moves: [{ f: [53.9, 27.5], t: [52.5, 24], s: 'enemy' }], to: { allies: ['GBR', 'FRA', 'IRL', ...BRITISH_DOMINIONS, ...BRITISH_ASIA, ...BRITISH_AFRICA, ...FRENCH_AFRICA, ...FRENCH_ASIA, 'SYR', 'LBN', 'IRQ', 'JOR', 'ISR', 'PSE'], held: ['POL'] }, major: ['GBR', 'FRA', 'CAN', 'AUS', 'IND'] },
    { m: 7, date: 'Apr 1940', title: 'Denmark and Norway fall', text: 'In a single day Germany takes Denmark and lands along Norway’s coast, securing the iron ore route.', at: [60, 9], alt: 1.4, moves: [{ f: [53.5, 10], t: [55.7, 12.5], s: 'enemy' }, { f: [54.3, 10], t: [59.9, 10.7], s: 'enemy' }, { f: [54, 8], t: [63.4, 10.4], s: 'enemy' }], to: { held: ['DNK', 'NOR'] } },
    { m: 8, date: 'May 1940', title: 'Blitzkrieg in the west', text: 'German armour cuts through the Ardennes and reaches the Channel in ten days. Over 338,000 Allied troops are taken off the beach at Dunkirk.', at: [50, 3.5], alt: 1, moves: [{ f: [50.3, 6.3], t: [49.7, 4.9], s: 'enemy' }, { f: [49.7, 4.9], t: [50.2, 1.6], s: 'enemy' }, { f: [51.5, 6.5], t: [52.37, 4.9], s: 'enemy' }, { f: [51.03, 2.38], t: [51.13, 1.31], s: 'allies' }], to: { held: ['NLD', 'BEL', 'LUX'] } },
    { m: 9, date: 'Jun 1940', title: 'France falls, Italy joins', text: 'Hitler’s troops march into Paris. Mussolini declares war, bringing Italy’s lands in Africa into the fight. French colonies largely follow the Vichy government for now.', at: [45, 8], alt: 2, moves: [{ f: [49.4, 2.5], t: [48.86, 2.35], s: 'enemy' }, { f: [48.86, 2.35], t: [46, 2], s: 'enemy' }], to: { held: ['FRA'], enemy: ['ITA', 'LBY', 'ERI', 'ETH', 'ALB'], none: ['DZA', 'TUN', 'MAR', 'SEN', 'MLI', 'NER', 'BFA', 'GIN', 'CIV', 'BEN', 'MRT', 'MDG', 'SYR', 'LBN'] }, major: ['ITA', 'FRA'] },
    { m: 10, date: 'Jul – Oct 1940', title: 'The Battle of Britain', text: 'The RAF holds off the Luftwaffe over southern England and the Blitz begins, but the invasion never comes. Britain fights on alone.', at: [51.5, -0.1], alt: 0.9, moves: [{ f: [49.5, 2], t: [51.5, -0.1], s: 'enemy' }, { f: [50, 1.2], t: [50.9, -1.4], s: 'enemy' }, { f: [51.1, 3.5], t: [52.4, -1.5], s: 'enemy' }] },
    { m: 12.5, date: 'Sep – Nov 1940', title: 'The Axis is sealed', text: 'Germany, Italy and Japan sign the Tripartite Pact. Hungary and Romania join; Bulgaria follows. Japan moves into French Indochina.', at: [30, 60], alt: 2.8, moves: [{ f: [22, 110], t: [21, 105.8], s: 'enemy' }], to: { enemy: ['HUN', 'ROU', 'BGR'], held: FRENCH_ASIA }, major: ['HUN', 'ROU', 'BGR'] },
    { m: 19, date: 'Apr 1941', title: 'The Balkans and the desert', text: 'Germany overruns Yugoslavia and Greece, rescuing Italy. In North Africa, Rommel’s Afrika Korps drives the British back towards Egypt.', at: [38, 22], alt: 1.7, moves: [{ f: [47, 16], t: [44.8, 20.4], s: 'enemy' }, { f: [41.7, 23.3], t: [38, 23.7], s: 'enemy' }, { f: [32.9, 13.2], t: [32, 24], s: 'enemy' }], to: { held: [...YUGOSLAVIA, 'GRC'] } },
    { m: 21.7, date: '22 Jun 1941', title: 'Operation Barbarossa', text: 'Over 3 million Axis soldiers invade the Soviet Union, the largest invasion ever. Hitler has broken his pact, and Stalin joins the Allies.', at: [53, 32], alt: 1.9, moves: [{ f: [54.7, 21], t: [59.9, 30.3], s: 'enemy' }, { f: [52.2, 23], t: [55.7, 37.6], s: 'enemy' }, { f: [50, 24], t: [50.4, 30.5], s: 'enemy' }, { f: [47, 28.8], t: [46.5, 30.7], s: 'enemy' }], to: { allies: SOVIET, held: SOVIET_WEST, enemy: ['FIN'] }, major: ['RUS', 'UKR', 'FIN'] },
    { m: 27, date: 'Dec 1941', title: 'Moscow holds', text: 'German scouts see the city’s domes, then winter and fresh Siberian divisions hit. Hitler’s hope of a quick win in the east is over.', at: [55.75, 37.6], alt: 1.2, moves: [{ f: [55.75, 37.6], t: [54.8, 33], s: 'allies' }, { f: [55, 82.9], t: [55.75, 38], s: 'allies' }] },
    { m: 27.2, date: '7 Dec 1941', title: 'Pearl Harbor', text: 'Japan strikes the US fleet in Hawaii and attacks across the Pacific. America is in, and within days Hitler declares war on it too.', at: [21.35, -157.97], alt: 2.2, moves: [{ f: [44, 147], t: [21.35, -157.97], s: 'enemy' }], to: { allies: ['USA', 'PHL', 'CRI', 'CUB', 'PAN'], enemy: ['THA'] }, major: ['USA', 'THA'] },
    { m: 30, date: 'Feb – May 1942', title: 'Japan sweeps the Pacific', text: 'Singapore, the Philippines, the Dutch East Indies and Burma fall in months. Japan’s empire is at its greatest extent.', at: [5, 112], alt: 2.3, moves: [{ f: [14.6, 121], t: [-6.2, 106.8], s: 'enemy' }, { f: [6, 101], t: [1.35, 103.8], s: 'enemy' }, { f: [13.75, 100.5], t: [16.8, 96.2], s: 'enemy' }, { f: [7.5, 134], t: [-6, 147], s: 'enemy' }], to: { held: ['PHL', 'IDN', 'MYS', 'SGP', 'BRN', 'MMR', 'PNG', 'TLS'] } },
    { m: 33, date: 'Jun 1942', title: 'Midway', text: 'US code-breakers set the trap and dive-bombers sink four Japanese carriers in a day. The tide in the Pacific begins to turn.', at: [28.2, -177.4], alt: 2, moves: [{ f: [21.35, -157.97], t: [30.5, -174], s: 'allies' }, { f: [34, 135], t: [30, -178], s: 'enemy' }], to: { allies: ['MEX', 'BRA'] } },
    { m: 35.5, date: 'Aug 1942 – Feb 1943', title: 'Stalingrad', text: 'Street by street, the Red Army holds the city on the Volga, then encircles the German Sixth Army. Some 2 million are killed, wounded or captured.', at: [48.7, 44.5], alt: 1.2, moves: [{ f: [49.99, 36.2], t: [48.7, 44.5], s: 'enemy' }, { f: [50, 42.6], t: [48.3, 43.5], s: 'allies' }, { f: [47.9, 46.1], t: [48.3, 43.5], s: 'allies' }] },
    { m: 38, date: 'Oct – Nov 1942', title: 'Alamein and Torch', text: 'Montgomery beats Rommel in Egypt, as US and British troops land in Morocco and Algeria. Germany then occupies the rest of France.', at: [31, 10], alt: 1.8, moves: [{ f: [30.8, 29], t: [32.1, 20], s: 'allies' }, { f: [36, -6.5], t: [33.6, -7.6], s: 'allies' }, { f: [36, -6.5], t: [36.75, 3], s: 'allies' }], to: { allies: ['MAR', 'DZA', 'SEN', 'MLI', 'NER', 'BFA', 'GIN', 'CIV', 'BEN', 'MRT', 'MDG'] } },
    { m: 44, date: 'May 1943', title: 'Victory in Africa', text: 'Axis forces in Tunisia surrender, some 250,000 of them. From here, the Allies can look north, across the Mediterranean.', at: [34, 10], alt: 1.2, moves: [{ f: [32.9, 13.2], t: [36.8, 10.2], s: 'allies' }, { f: [36.75, 3], t: [36.8, 10], s: 'allies' }], to: { allies: ['TUN', 'LBY', 'ETH', 'ERI', 'SYR', 'LBN'] } },
    { m: 46, date: 'Jul 1943', title: 'Kursk', text: 'In the largest tank battle ever fought, German armour breaks on deep Soviet defences. In the east, the initiative is now Moscow’s for good.', at: [51.7, 36.2], alt: 1.1, moves: [{ f: [50.6, 36.6], t: [51.4, 36.3], s: 'enemy' }, { f: [53, 36], t: [52.1, 36.2], s: 'enemy' }, { f: [51.7, 36.2], t: [50, 36.2], s: 'allies' }] },
    { m: 47.5, date: 'Jul – Sep 1943', title: 'Italy is invaded', text: 'The Allies land in Sicily, Mussolini is toppled, and Italy surrenders. German troops seize the north and the fighting goes on up the peninsula.', at: [40, 15], alt: 1.2, moves: [{ f: [36.8, 10.2], t: [37.5, 14], s: 'allies' }, { f: [38, 15.6], t: [40.6, 14.8], s: 'allies' }, { f: [47, 11.4], t: [43, 12], s: 'enemy' }], to: { held: ['ITA', 'ALB'] } },
    { m: 49, date: '1943 – 1944', title: 'Island hopping', text: 'From Guadalcanal on, US forces leap from island to island towards Japan: Tarawa, Kwajalein, Saipan, Guam. Burma’s front turns too, at Imphal and Kohima.', at: [8, 165], alt: 2.4, moves: [{ f: [-9.5, 160], t: [1.4, 173], s: 'allies' }, { f: [1.4, 173], t: [8.7, 167.7], s: 'allies' }, { f: [8.7, 167.7], t: [15.2, 145.7], s: 'allies' }], to: { allies: ['SLB', 'PNG'] } },
    { m: 57, date: '6 Jun 1944', title: 'D-Day', text: '156,000 Allied troops storm five beaches in Normandy in the largest seaborne invasion in history. The liberation of western Europe has begun.', at: [49.4, -0.9], alt: 0.85, moves: [{ f: [50.75, -1.1], t: [49.37, -0.87], s: 'allies' }, { f: [50.72, -3.5], t: [49.4, -1.1], s: 'allies' }, { f: [50.8, 0.2], t: [49.34, -0.4], s: 'allies' }] },
    { m: 57.7, date: 'Jun – Aug 1944', title: 'Operation Bagration', text: 'A huge Soviet offensive destroys Germany’s Army Group Centre and rolls across Belarus to the Vistula. Ukraine and the Baltics are retaken.', at: [53.5, 27.5], alt: 1.4, moves: [{ f: [55, 31], t: [53.9, 27.5], s: 'allies' }, { f: [53.9, 27.5], t: [52.5, 21.5], s: 'allies' }], to: { allies: SOVIET_WEST } },
    { m: 59.5, date: 'Aug – Sep 1944', title: 'Paris is free', text: 'France, Belgium and Luxembourg are liberated. Romania, Bulgaria and Finland abandon Germany as Soviet armies close in.', at: [47, 12], alt: 1.8, moves: [{ f: [49.4, -0.9], t: [48.86, 2.35], s: 'allies' }, { f: [48.86, 2.35], t: [50.85, 4.35], s: 'allies' }, { f: [43.3, 5.4], t: [47.3, 5], s: 'allies' }, { f: [47, 28.8], t: [44.43, 26.1], s: 'allies' }], to: { allies: ['FRA', 'BEL', 'LUX', 'ROU', 'BGR'], out: ['FIN'] } },
    { m: 61, date: 'Oct 1944', title: 'Leyte Gulf', text: 'In perhaps the largest sea battle ever, Japan’s navy is destroyed. MacArthur returns to the Philippines, and the first kamikazes are seen.', at: [10.8, 125.5], alt: 1.7, moves: [{ f: [13.5, 144.8], t: [10.8, 125.5], s: 'allies' }, { f: [33, 135], t: [12, 125], s: 'enemy' }], to: { allies: ['PHL', 'GRC'] } },
    { m: 63.5, date: 'Dec 1944', title: 'The Battle of the Bulge', text: 'Hitler’s last gamble: a winter strike through the Ardennes. Bastogne holds, and the attack burns through Germany’s last reserves.', at: [50, 5.7], alt: 0.8, moves: [{ f: [50.3, 6.3], t: [50.2, 5.1], s: 'enemy' }, { f: [49.1, 6.2], t: [50, 5.7], s: 'allies' }] },
    { m: 66, date: 'Jan – Apr 1945', title: 'Closing in', text: 'Soviet troops free Auschwitz and cross into Germany, as the Allies cross the Rhine. In the Pacific, the US takes Iwo Jima and Okinawa.', at: [51, 15], alt: 2, moves: [{ f: [52.5, 21], t: [52.4, 14.5], s: 'allies' }, { f: [50.9, 6.9], t: [51.5, 11.5], s: 'allies' }, { f: [47.5, 19], t: [48.2, 16.4], s: 'allies' }], to: { allies: ['POL', 'HUN', 'SVK', 'NLD', 'NOR', 'DNK', 'ITA', 'ALB', ...YUGOSLAVIA, 'MMR'] } },
    { m: 68, date: '8 May 1945', title: 'Victory in Europe', text: 'Hitler is dead by his own hand, Berlin falls to the Red Army, and Germany surrenders unconditionally. The Holocaust’s horrors are laid bare.', at: [52.52, 13.4], alt: 1.3, moves: [{ f: [52.4, 14.6], t: [52.52, 13.4], s: 'allies' }, { f: [51.2, 14.9], t: [52.3, 13.5], s: 'allies' }, { f: [51.5, 11.5], t: [51.7, 12.6], s: 'allies' }], to: { out: ['DEU', 'AUT'], allies: ['CZE'] }, major: ['DEU'] },
    { m: 71, date: '6 – 9 Aug 1945', title: 'Hiroshima and Nagasaki', text: 'US atomic bombs destroy two cities, and the USSR invades Japanese-held Manchuria. Nuclear weapons have been used in war for the first time, and so far the last.', at: [34.4, 132.45], alt: 1.6, moves: [{ f: [15, 145.65], t: [34.4, 132.45], s: 'allies' }, { f: [15, 145.65], t: [32.75, 129.9], s: 'allies' }, { f: [48.5, 135], t: [44, 126], s: 'allies' }] },
    { m: 72, date: '2 Sep 1945', title: 'Japan surrenders', text: 'On the deck of the USS Missouri in Tokyo Bay, Japan formally gives up. After six years, the Second World War is over.', at: [35.4, 139.8], alt: 2.3, to: { out: ['JPN'], allies: ['KOR', 'PRK', 'TWN', 'IDN', 'MYS', 'SGP', 'BRN', 'TLS', ...FRENCH_ASIA], none: ['THA'] }, major: ['JPN'] },
  ],
};

export const WORLD_WARS = { ww1: WW1, ww2: WW2 };

/** Who stands where after the first `upto + 1` events: cca3 → status. */
export function warMapAt(war: WorldWar, upto: number): Map<string, Exclude<WarStatus, null>> {
  const map = new Map<string, Exclude<WarStatus, null>>();
  for (const [status, ids] of Object.entries(war.start)) for (const id of ids ?? []) map.set(id, status as Exclude<WarStatus, null>);
  for (const ev of war.events.slice(0, upto + 1)) {
    for (const [status, ids] of Object.entries(ev.to ?? {})) for (const id of ids ?? []) {
      if (status === 'none') map.delete(id); else map.set(id, status as Exclude<WarStatus, null>);
    }
  }
  return map;
}

/** The event showing when the timeline stands at month `m`: the latest to have happened. */
export function eventAtMonth(war: WorldWar, m: number) {
  let i = 0;
  for (let k = 0; k < war.events.length; k++) if (war.events[k].m <= m) i = k;
  return i;
}
