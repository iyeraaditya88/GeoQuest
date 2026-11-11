/** An area of the past that today's countries can't show (an empire's reach, an occupied zone). */
export interface HistShape {
  id: string;
  /** Which war's timeline it belongs to, and when it shows: from ≤ month < until. */
  war: 'ww1' | 'ww2';
  from: number;
  until: number;
  side: 'allies' | 'enemy' | 'held' | 'out';
  /** Its name on the map ('' for none). */
  name: string;
  /** One ring, [lat, lng], not closed. */
  ring: [number, number][];
  /** A hand-placed path for the name ([lat, lng]); otherwise it follows the shape's long axis. */
  spine?: [number, number][];
}
