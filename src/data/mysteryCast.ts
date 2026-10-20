// "Solve the Mystery": the original cast. The Atlas Bureau (you) chases the Magpies — a ring of
// collectors who steal the world's shiny things. Every name, item and line here is our own.

/** Suspect traits come in three kinds, two of each — so 8 suspects cover every combination,
 *  and naming the culprit takes all three clues (any two leave a 50/50). */
export const TRAITS = {
  look: ['a long grey coat', 'a bright green scarf'],
  hobby: ['chess', 'birdwatching'],
  ride: ['a vintage motorbike', 'the night train'],
} as const;
export type TraitKind = keyof typeof TRAITS;

export interface Suspect {
  id: string;
  name: string;
  alias: string;
  look: 0 | 1; hobby: 0 | 1; ride: 0 | 1;  // index into TRAITS
  hat: 'fedora' | 'beret' | 'cap' | 'none';
  hair: string;                            // colour for the silhouette
  bio: string;
}

export const SUSPECTS: Suspect[] = [
  { id: 'quill', name: 'Vera Quill', alias: 'The Ink', look: 0, hobby: 0, ride: 0, hat: 'beret', hair: '#cbd5e1', bio: 'A former museum archivist who knows every alarm system by heart.' },
  { id: 'rook', name: 'Silas Rook', alias: 'The Gambit', look: 0, hobby: 0, ride: 1, hat: 'fedora', hair: '#1f2937', bio: 'Plans every heist ten moves ahead.' },
  { id: 'vale', name: 'Mina Vale', alias: 'The Lark', look: 0, hobby: 1, ride: 0, hat: 'none', hair: '#b45309', bio: 'Can tell a kestrel from a kite at a hundred metres.' },
  { id: 'brass', name: 'Otto Brass', alias: 'The Tinker', look: 0, hobby: 1, ride: 1, hat: 'cap', hair: '#9a3412', bio: 'Repairs antique clocks — and opens antique locks.' },
  { id: 'marrow', name: 'Juno Marrow', alias: 'The Diva', look: 1, hobby: 0, ride: 0, hat: 'none', hair: '#111827', bio: 'Never misses an opera — or an unguarded vault.' },
  { id: 'thorne', name: 'Felix Thorne', alias: 'The Climber', look: 1, hobby: 0, ride: 1, hat: 'cap', hair: '#78350f', bio: 'Scales museum walls like they were climbing gyms.' },
  { id: 'calloway', name: 'Ines Calloway', alias: 'The Heron', look: 1, hobby: 1, ride: 0, hat: 'fedora', hair: '#7c2d12', bio: 'Travels light, leaves no footprints.' },
  { id: 'holloway', name: 'Bram Holloway', alias: 'The Collector', look: 1, hobby: 1, ride: 1, hat: 'beret', hair: '#a8a29e', bio: 'Owns a thousand stamps — and a few stolen treasures.' },
];

export const ITEMS = [
  'the Gilded Compass', 'the Moonstone Atlas', 'the Clockwork Nightingale', 'the Emerald Sextant',
  'the Silver Star Chart', 'the Jade Astrolabe', 'the Sapphire Globe', 'the Golden Hourglass',
  'the Ivory Telescope', 'the Pearl Map Case', 'the Copper Orrery', 'the Amber Logbook',
];

/** Who tells you what. Each kind of clue comes from a fitting witness. */
export const WITNESS: Record<string, { role: string; icon: string }> = {
  capital: { role: 'Taxi driver', icon: '🚕' },
  flag: { role: 'Porter', icon: '🧳' },
  currency: { role: 'Money changer', icon: '💱' },
  language: { role: 'Hotel clerk', icon: '🛎️' },
  river: { role: 'Tour guide', icon: '🧭' },
  peak: { role: 'Outdoor shop owner', icon: '🥾' },
  range: { role: 'Map seller', icon: '🗺️' },
  tip: { role: 'Bus driver', icon: '🚌' },
  drive: { role: 'Car rental clerk', icon: '🚗' },
  neighbours: { role: 'Border officer', icon: '🛂' },
  coast: { role: 'Travel agent', icon: '✈️' },
  look: { role: 'Café owner', icon: '☕' },
  hobby: { role: 'Bookseller', icon: '📚' },
  ride: { role: 'Station guard', icon: '🚉' },
};

/** Messages the Magpie leaves behind (intercepted at each stop). Our own lines. */
export const TAUNTS = [
  'Too slow, Detective. The trail is already cold.',
  'Lovely city. Shame you won’t be staying long.',
  'You’ll never guess where I’m going next. Or will you?',
  'I left you a little puzzle. Try not to get lost.',
  'Collecting treasures is easy. Catching me is not.',
  'Still following? How flattering.',
  'Check the clock, Detective. Tick, tock.',
  'One step ahead — as always.',
  'My feathers are faster than your feet.',
  'A Magpie never looks back. You should, though.',
];
