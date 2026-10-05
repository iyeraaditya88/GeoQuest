// Where the info panel goes: a side panel on wide screens and on phones held sideways,
// a bottom sheet on phones held upright. CSS mirrors this (see "Landscape phones" in styles.css).
export const sidePanel = (w: number, h: number) => w > 900 || (w > h && w >= 560 && h <= 520);
/** Width of the side panel in px (0 when it's a bottom sheet). */
export const panelWidth = (w: number, h: number) => (w > 900 ? 420 : sidePanel(w, h) ? Math.min(380, Math.round(w * 0.48)) : 0);
