// How a drawing's wires are drawn (#4081): its `wireStyle`, the same three for the schematic editor and the circuit
// editor (#4080), the ⋮ menu's "Wires" choice.
//   direct      a straight line from end to end, or through the wire's own points (no routing)
//   orthogonal  horizontal and vertical segments, the technical drawing (the default: a file without wireStyle)
//   curved      a smooth curve (#1144, core/schcurve.js)
// The look only: what a wire connects is the same whichever way it is drawn.

/** The styles, in the menu's order: { id, label } (the labels translated by web/js/i18n-schematic.js). */
export const WIRE_STYLES = Object.freeze([
  Object.freeze({ id: 'direct', label: 'Direct' }),
  Object.freeze({ id: 'orthogonal', label: 'Orthogonal' }),
  Object.freeze({ id: 'curved', label: 'Curved' }),
]);
// the style of a drawing whose file says none
const DEFAULT_WIRE_STYLE = 'orthogonal';
/** The title of the menu's choice. */
export const WIRE_STYLE_TITLE = 'Wires';

/** Whether s is one of the styles' ids. */
export const isWireStyle = s => WIRE_STYLES.some(x => x.id === s);
/** A drawing's style: its wireStyle when it is one of them, else the default. */
export const wireStyleOf = doc => (isWireStyle(doc?.wireStyle) ? doc.wireStyle : DEFAULT_WIRE_STYLE);
/** Whether its wires are drawn through their knots (direct or curved), not along their rectilinear path. */
export const isFreeStyle = doc => wireStyleOf(doc) !== 'orthogonal';
/** The drawing's wireStyle set to s (one of the ids; the default dropped, as a file without it reads); the drawing. */
export function setWireStyle(doc, s) {
  if (!isWireStyle(s)) throw new Error(`unknown wire style '${s}': ${WIRE_STYLES.map(x => x.id).join(', ')}`);
  if (s === DEFAULT_WIRE_STYLE) delete doc.wireStyle; else doc.wireStyle = s;
  return doc;
}
/** A wireStyle as read from a file: kept when it is direct or curved, else dropped (orthogonal). */
export function normalizeWireStyle(doc) {
  if (!isWireStyle(doc.wireStyle) || doc.wireStyle === DEFAULT_WIRE_STYLE) delete doc.wireStyle;
  return doc;
}
