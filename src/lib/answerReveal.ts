// After answering in Geo Trivia and Capitals: how long the answer stays up before the next question.

/** On the map: long enough for the flight (up to 1.5 s) and a look round. Otherwise just time to read. */
export const revealMs = (right: boolean, onMap: boolean) => (onMap ? 4000 : right ? 1300 : 2300);
/** On phones, the answer buttons make way for the map this long after answering. */
export const COLLAPSE_MS = 1000;
/** The round ends only once the last answer's feedback has been seen (or there's nothing left to ask). */
export const roundOver = (answered: number, total: number, picked: string | null, hasQuestion: boolean) => !hasQuestion || (answered >= total && !picked);
