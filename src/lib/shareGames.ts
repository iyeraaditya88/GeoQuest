// The games you can share, and how each is pitched in an invite or a link preview. No imports,
// so the link-preview middleware can use it too.
export type ShareGame = 'daily' | 'wordle' | 'mystery' | 'quiz' | 'top5' | 'trivia' | 'shapes' | 'street' | 'capitals';
export const SHARE_GAMES: ShareGame[] = ['daily', 'wordle', 'mystery', 'quiz', 'top5', 'trivia', 'shapes', 'street', 'capitals'];
export const isShareGame = (g: unknown): g is ShareGame => SHARE_GAMES.includes(g as ShareGame);

/** What each game is called, and the one-line pitch for an invite. */
export const GAME_PITCH: Record<ShareGame, { name: string; pitch: string; emoji: string }> = {
  daily: { name: 'GeoQuest Daily', pitch: 'Five new countries to find on the globe, every day', emoji: '📅' },
  wordle: { name: 'Geo Wordle', pitch: 'Wordle, but the word is a country', emoji: '🟩' },
  mystery: { name: 'Solve the Mystery', pitch: 'Chase a thief across the world, one clue at a time', emoji: '🕵️' },
  quiz: { name: 'Map quiz', pitch: 'Find countries, flags and clues on a 3D globe', emoji: '🗺️' },
  top5: { name: 'Name the Top 5', pitch: 'The longest rivers, highest peaks, biggest cities…', emoji: '🏆' },
  trivia: { name: 'Geo Trivia', pitch: 'Geography trivia that gets harder as you get better', emoji: '🧠' },
  shapes: { name: 'Guess the Country', pitch: 'Name the country from its outline', emoji: '🧩' },
  street: { name: 'Street View', pitch: 'Dropped somewhere on Earth — where are you?', emoji: '📍' },
  capitals: { name: 'Capitals', pitch: 'Countries and their capitals, 10 a round', emoji: '🏛️' },
};

