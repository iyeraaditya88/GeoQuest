// three-globe imports h3-js (~0.5 MB) only for its hexbin/hexed-polygon layers, which
// GeoQuest never uses. vite.config aliases h3-js here to keep it out of the bundle.
const unused = (): never => { throw new Error('h3-js is stubbed out (hex layers are not used in GeoQuest)'); };
export const latLngToCell = unused;
export const cellToLatLng = unused;
export const cellToBoundary = unused;
export const polygonToCells = unused;
