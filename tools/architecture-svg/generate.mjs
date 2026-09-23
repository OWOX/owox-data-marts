#!/usr/bin/env node
/* The product architecture drawing for README.md, generated.
 *
 * Six layers — Sources, Storages, Data Marts, Data Destinations, Reports,
 * Plugins — each a lane of cards, the way the Data Flow plugin lays a project
 * out. A card is the product's own node card: a brand mark on a white plate,
 * a name, a row of badges, and a foot of status glyphs. One chain is selected
 * and carries a 2px link-coloured border; every other card is dimmed, exactly
 * as selecting a node in the plugin does. Related data marts are joined by
 * grey lines whatever is selected, because that relation is a property of the
 * model rather than of the selection.
 *
 * Nothing here knows a card's name: the picture is entirely
 * docs/res/architecture/architecture.json, which is the same shape as the
 * owox.com /product page's canvas data — blocks of cards, where a card names
 * what it connects to (`storage`, `sources`, `destinations`, `mart`,
 * `destination`) and the lines are derived from that. `related` is this
 * drawing's one addition, naming the marts a mart is relevant to.
 *
 * Two files come out, dark and light, because a README is read on both of
 * GitHub's themes and GitHub strips CSS media queries inside an <img> SVG —
 * the <picture> element in README.md picks between them.
 *
 * Usage: node tools/architecture-svg/generate.mjs [--check]
 *        --check writes nothing and fails if the committed files are stale.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPHS } from './glyphs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const RES = join(ROOT, 'docs/res/architecture');
const MARKS = join(RES, 'marks');
const SOURCES = join(ROOT, 'packages/connectors/src/Sources');

/* ---------------------------------------------------------------- palette */

/* The semantic tokens of the OWOX design system, resolved. Dark is the system;
 * light is the same twenty aliases swapped, and nothing below them moves.
 *
 * `link` is what joins two cards, the colour the data-connectors selector
 * rings a chosen tile in. Every page of the site renders dark, so that page
 * only ever paints the dark value; the light file keeps --text-link's own
 * light value instead of borrowing it, because #459ce9 falls to about 3:1 on
 * white where #0b63b8 holds 6:1 (user ruling). */
const THEMES = {
  dark: {
    page: '#1a1f2e',
    band: '#1f2536',
    elevated: '#242a3b',
    nested: '#2b3346',
    plate: '#171c29',
    quiet: '#2e374b',
    border: '#3a4358',
    primary: '#e9ecf2',
    secondary: '#9ba4b6',
    muted: '#828ea5',
    decor: '#646f87',
    link: '#459ce9',
    ok: '#27ae60',
    warn: '#f3d16c',
  },
  light: {
    page: '#ffffff',
    band: '#f4f6fa',
    elevated: '#ffffff',
    nested: '#edf1f8',
    plate: '#e3e9f3',
    quiet: '#e2e8f1',
    border: '#d1d9e6',
    primary: '#1a1f2e',
    secondary: '#42506b',
    muted: '#5e6b85',
    decor: '#7c8aa3',
    link: '#0b63b8',
    ok: '#14713c',
    warn: '#7c5e03',
  },
};

/* A layer's own colour, the one the hero cube puts on that face. */
const TINT = {
  sources: '#9458a7',
  storages: '#b5972d',
  marts: '#3a6fa7',
  destinations: '#76c26f',
  reports: '#ca8138',
  plugins: '#813a32',
};

/* ----------------------------------------------------------------- metrics */

const PAD = 28; // page margin
const COLS = 4;
const CARD_W = 210;
/* One gap, both directions. Cards sit as close vertically as horizontally, the
 * way a layer's grid does in the plugin. */
const GAP = 16;
const ROW_GAP = GAP;
const BAND_GAP = 10; // layers all but touch; the plugin stacks them tight
const BAND_PAD = 16;
/* The margin round the whole drawing. A lane starts BAND_PAD inside the column
 * grid, so this is what is actually left at the left and right edges — and the
 * top and bottom take the same, rather than PAD's wider gap. */
const MARGIN = PAD - BAND_PAD;
const BAND_HEAD = 28; // the layer's own header row, inside the container
const BAND_HEAD_GAP = 14;

const CARD_PAD = 12;
const MARK = 24; // the white plate
const HEAD_GAP = 8;
const BADGE_H = 18;
const BADGE_GAP = 4;
const FOOT_H = 16;
const STACK_GAP = 8;
const SEE_ALL_H = 80; // .nodecard--more's min-height: 5rem

const WIDTH = PAD * 2 + COLS * CARD_W + (COLS - 1) * GAP;
const colX = c => PAD + c * (CARD_W + GAP);

const TITLE_SIZE = 13;
const BADGE_SIZE = 11;
const META_SIZE = 11;

const SANS = "Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/* How faint a card outside the selection reads. The live page uses 0.3; a
 * README is a still picture with no hover to recover the rest, so the dimmed
 * cards stay legible rather than merely present. Dark ink fading towards white
 * loses contrast faster than pale ink fading towards navy, so the two grounds
 * do not take the same number. */
const DIM = { dark: 0.45, light: 0.55 };

/* A dimmed card is not opaque: the ground under it stays 15% transparent, so an
 * edge that runs behind it is still followed rather than swallowed. The lit
 * cards keep a solid ground — the chain has to read cleanly over everything. */
const DIM_ALPHA = 0.85;

/* ------------------------------------------------------------ text metrics */

/* Helvetica advance widths per 1000 units — the metrics of the face a reader
 * actually gets when Roboto is absent, which is the case to lay out for. Used
 * to size a badge's plate and to decide when a name needs an ellipsis. */
// prettier-ignore
const W = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333,
  '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584,
  '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  '{': 334, '|': 260, '}': 334, '~': 584, '·': 278, '—': 1000, '…': 1000, '×': 584,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556,
  M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667,
  Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222,
  m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
  y: 500, z: 500,
};
const DIGIT = 556;

const textWidth = (text, size, weight = 400) => {
  let units = 0;
  for (const ch of String(text)) units += ch >= '0' && ch <= '9' ? DIGIT : (W[ch] ?? 556);
  /* A medium face sets a little wider than the regular one it falls back to. */
  return (units / 1000) * size * (weight >= 500 ? 1.03 : 1);
};

/** The text, cut with an ellipsis when it will not sit inside `max`. */
function clip(text, size, max, weight = 400) {
  if (textWidth(text, size, weight) <= max) return text;
  let out = String(text);
  while (out.length > 1 && textWidth(`${out}…`, size, weight) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

const esc = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const n = v => (Math.round(v * 100) / 100).toString();

/* Text, pinned to the width the layout reserved for it.
 *
 * The layout is computed from one metric table, but the machine rendering this
 * file picks its own face from the stack — on a Mac with no Roboto that is SF
 * Pro, about 9% wider than the Helvetica the table describes, which pushed
 * "468 conversations" 2.2px past its plate. A README image cannot know what is
 * installed where it is read, so it does not guess: `textLength` makes the run
 * occupy exactly the reserved width, and the picture is the same everywhere.
 */
const text = (x, y, content, { size, weight, fill, opacity, anchor } = {}) => {
  const body = String(content);
  const px = size ?? TITLE_SIZE;
  return (
    `<text x="${n(x)}" y="${n(y)}" font-family="${SANS}" font-size="${px}"` +
    `${weight ? ` font-weight="${weight}"` : ''} fill="${fill}"` +
    `${opacity !== undefined ? ` fill-opacity="${opacity}"` : ''}` +
    `${anchor ? ` text-anchor="${anchor}"` : ''}` +
    ` dominant-baseline="central" textLength="${n(textWidth(body, px, weight ?? 400))}"` +
    ` lengthAdjust="spacingAndGlyphs">${esc(body)}</text>`
  );
};

/* ------------------------------------------------------------------- brand */

const LOGO_SIZE = 26;

/* The OWOX icon sits in the corner as itself: it carries its own gradients,
 * and markBody() namespaces their ids, so it goes in as a mark like any other
 * logo rather than being flattened to one colour. */
/* ------------------------------------------------------------------- marks */

/* Brand marks are inlined as they are — a logo keeps its own colours, which is
 * why it is not painted currentColor. Each is nested as its own <svg> so its
 * viewBox survives, and its ids are prefixed so two marks never collide in one
 * document. */
const markFiles = new Map(
  readdirSync(MARKS)
    .filter(f => f.endsWith('.svg'))
    .map(f => [f.replace(/\.svg$/, ''), join(MARKS, f)])
);

/* The paint a root <svg> can carry and its children inherit. */
const PAINT = [
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'clip-rule',
  'color',
  'opacity',
];

const markCache = new Map();
function markBody(name) {
  if (markCache.has(name)) return markCache.get(name);
  const file = markFiles.get(name);
  if (!file) throw new Error(`No mark for "${name}" in ${MARKS}`);
  const raw = readFileSync(file, 'utf8')
    .replace(/<\?xml[^>]*\?>/g, '')
    .trim();
  const open = raw.match(/^<svg\b([^>]*)>/i);
  if (!open) throw new Error(`${file} does not start with an <svg> element`);
  const viewBox = open[1].match(/viewBox="([^"]+)"/i)?.[1] ?? '0 0 24 24';
  /* A mark may paint itself from the root element — email.svg is a stroked
   * outline with `fill="none" stroke="#1E88E5"` there and nothing on its paths.
   * Dropping the root drops the paint with it, and the glyph fills solid black,
   * so those attributes are carried onto the nested <svg> that replaces it. */
  const paint = PAINT.flatMap(a => {
    const v = open[1].match(new RegExp(`\\s${a}="([^"]+)"`, 'i'))?.[1];
    return v === undefined ? [] : [`${a}="${v}"`];
  }).join(' ');
  let inner = raw.slice(open[0].length).replace(/<\/svg>\s*$/i, '');
  /* Namespace every id the mark defines, and every reference to one. */
  const ids = [...inner.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  for (const id of ids) {
    const to = `${name}-${id}`;
    inner = inner
      .split(`id="${id}"`)
      .join(`id="${to}"`)
      .split(`url(#${id})`)
      .join(`url(#${to})`)
      .split(`href="#${id}"`)
      .join(`href="#${to}"`);
  }
  const body = { viewBox, inner, paint };
  markCache.set(name, body);
  return body;
}

const mark = (name, x, y, size) => {
  const { viewBox, inner, paint } = markBody(name);
  return `<svg x="${n(x)}" y="${n(y)}" width="${size}" height="${size}" viewBox="${viewBox}"${paint ? ` ${paint}` : ''} overflow="visible">${inner}</svg>`;
};

/** A Lucide glyph, stroked in `colour`, its 24×24 box scaled to `size`. */
function glyph(name, x, y, size, colour, width = 2) {
  const body = GLYPHS[name];
  if (!body) throw new Error(`No glyph "${name}"`);
  const k = size / 24;
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(k)})" fill="none" stroke="${colour}" ` +
    `stroke-width="${n(width / k)}" stroke-linecap="round" stroke-linejoin="round" color="${colour}">${body}</g>`
  );
}

/* ------------------------------------------------------------- connectors */

/* Every number a card shows is declared in architecture.json. For a source
 * that is `endpoints` and `fields` — the pair the data-connectors page puts on
 * a source tile — and the connector is still read here to check them, because
 * a number nobody can verify is a number that quietly goes wrong: this drawing
 * already shipped once with Shopify at 337 fields after the connector moved to
 * 339. Declared in the JSON, checked against the source of truth.
 *
 * `<Source>/<...>APIReference/*FieldsSchema.js` is the registry, endpoint name
 * to `{ fields }`. Those files are Apps Script globals rather than modules, so
 * they are concatenated into one script and evaluated: the reference files
 * declare the field objects, the schema file names them, and a trailing
 * expression hands the object back. One script because the schema is sometimes
 * a `const`, which never becomes a property of the context.
 */
const statsCache = new Map();
function connectorStats(name) {
  if (statsCache.has(name)) return statsCache.get(name);
  const base = join(SOURCES, name);
  const ref = readdirSync(base).find(
    d =>
      statSync(join(base, d)).isDirectory() &&
      readdirSync(join(base, d)).some(f => /FieldsSchema\.js$/.test(f))
  );
  if (!ref) throw new Error(`No API reference folder for connector "${name}" in ${base}`);
  const dir = join(base, ref);
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  const schemaFile = files.find(f => /FieldsSchema\.js$/.test(f));
  const declared = readFileSync(join(dir, schemaFile), 'utf8').match(
    /(?:var|const|let)\s+(\w*FieldsSchema)\s*=/
  );
  if (!declared) throw new Error(`${schemaFile} declares no *FieldsSchema binding`);
  const code =
    [...files.filter(f => f !== schemaFile), schemaFile]
      .map(f => readFileSync(join(dir, f), 'utf8'))
      .join('\n;\n') + `\n;(${declared[1]})`;
  /* DATA_TYPES is the only global the reference files reach for; every member
   * of it is a type name, so a proxy answering with the key is enough. */
  const context = vm.createContext({ DATA_TYPES: new Proxy({}, { get: (_, k) => String(k) }) });
  const schema = vm.runInContext(code, context, { filename: `${name}/${schemaFile}` });
  /* A commented-out endpoint is not an endpoint, and one without a field map
   * is a stub — both are simply absent from the object by then. */
  const endpoints = Object.values(schema).filter(e => e && typeof e === 'object' && e.fields);
  const stats = {
    endpoints: endpoints.length,
    fields: endpoints.reduce((sum, e) => sum + Object.keys(e.fields).length, 0),
  };
  statsCache.set(name, stats);
  return stats;
}

/* --------------------------------------------------------------- the model */

/* What connects to what, read out of the cards themselves: a source names its
 * storage; a mart names its storage, its sources and its destinations; a report
 * or a plugin names the destination it reads through. Same derivation the
 * /product canvas uses. */
/* Every id a card names must be a card that is drawn. A stale reference — a
 * report pointing at a data mart that was taken out of the picture — would
 * otherwise render as a card with no mark and an edge that goes nowhere, which
 * is a wrong picture rather than a crash. */
/* The declared endpoint and field counts, against the connector they name. */
function checkConnectorCounts(blocks) {
  const wrong = [];
  for (const card of blocks.flatMap(b => b.cards)) {
    if (!card.connector) continue;
    const real = connectorStats(card.connector);
    if (card.endpoints !== real.endpoints || card.fields !== real.fields) {
      wrong.push(
        `${card.id}: declares ${card.endpoints}/${card.fields}, ` +
          `${card.connector} has ${real.endpoints}/${real.fields}`
      );
    }
  }
  if (wrong.length) {
    throw new Error(
      `architecture.json is out of date with packages/connectors (endpoints/fields):\n  ${wrong.join('\n  ')}`
    );
  }
}

function checkReferences(blocks) {
  const cards = blocks.flatMap(b => b.cards);
  const known = new Set(cards.map(c => c.id));
  const bad = [];
  for (const c of cards) {
    for (const [key, value] of Object.entries(c)) {
      if (!['storage', 'mart', 'destination', 'sources', 'destinations', 'related'].includes(key))
        continue;
      for (const id of [value].flat()) if (!known.has(id)) bad.push(`${c.id}.${key} -> ${id}`);
    }
  }
  if (bad.length)
    throw new Error(`architecture.json names cards that do not exist:\n  ${bad.join('\n  ')}`);
}

function wiresOf(blocks) {
  const seen = new Set();
  const wires = [];
  const add = (from, to) => {
    const key = `${from}>${to}`;
    if (!from || !to || from === to || seen.has(key)) return;
    seen.add(key);
    wires.push({ from, to });
  };
  for (const card of blocks.flatMap(b => b.cards)) {
    if (card.storage && !card.sources) add(card.id, card.storage);
    if (card.storage && card.sources) add(card.storage, card.id);
    for (const d of card.destinations ?? []) add(card.id, d);
    if (card.destination) add(card.destination, card.id);
  }
  return wires;
}

const count = (v, word) => `${v} ${word}${v === 1 ? '' : 's'}`;

/* The definition-type glyphs, as the plugin's own KIND table has them. */
const KIND_ICON = { SQL: 'code', Table: 'table', View: 'grip' };

/* What a counted badge counts, as a glyph: the same mark the thing wears
 * elsewhere in the drawing — a data mart's box, a report's page, an endpoint's
 * table, a field's column. */
const UNIT_ICON = {
  'data mart': 'box',
  report: 'file-text',
  conversation: 'message-square',
  endpoint: 'plug',
  key: 'key-round',
  field: 'columns-3',
};

/** The badges under a card's name — the same set the /product canvas puts there. */
function badgesOf(blocks, blockId, card) {
  const out = card.note ? [{ text: card.note, icon: KIND_ICON[card.note] }] : [];
  if (card.connector) {
    /* A source says what it imports: its endpoints, and the fields they land. */
    out.push({ icon: 'plug', text: count(card.endpoints, 'endpoint') });
    out.push({ icon: 'columns-3', text: `${card.fields.toLocaleString('en-US')} fields` });
  } else if (card.sources) {
    if (card.fields) out.push({ icon: 'columns-3', text: count(card.fields, 'field') });
    if (card.triggers) out.push({ icon: 'calendar-clock', text: count(card.triggers, 'trigger') });
    if (card.relationships)
      out.push({ icon: 'waypoints', text: count(card.relationships, 'relationship') });
  } else if (card.mart) {
    if (card.columns)
      out.push({ icon: 'columns-3', title: `${count(card.columns, 'column')} in the output` });
    if (card.schedule) out.push({ icon: 'calendar-clock', title: card.schedule });
    if (card.slice)
      out.push({ icon: 'layers', title: `Pre-join filter (slice) — ${count(card.slice, 'rule')}` });
    if (card.filter)
      out.push({ icon: 'filter', title: `Output filter — ${count(card.filter, 'rule')}` });
    if (card.aggregations)
      out.push({ icon: 'sigma', title: count(card.aggregations, 'aggregated column') });
  } else if (card.destination) {
    /* A plugin: it has a destination but no mart, and what it is worth saying
     * about it is the door it reads the project through. */
    const through = blocks.flatMap(b => b.cards).find(c => c.id === card.destination);
    if (through) out.push({ icon: 'key-round', text: `via ${through.name}` });
  } else if (card.count !== undefined) {
    const unit = card.unit ?? (blockId === 'destinations' ? 'report' : 'data mart');
    out.push({ icon: UNIT_ICON[unit], text: count(card.count, unit) });
  }
  return out;
}

/** A report has no mark of its own; it wears the one of the destination it writes to. */
const logoOf = (card, byId) =>
  card.logo ?? (card.mart ? byId.get(card.destination)?.logo : undefined);

/* Badge plate width: 6px of padding either side, a 12px glyph and a 4px gap. */
const badgeW = b =>
  12 + (b.icon ? 12 + (b.text ? 4 : 0) : 0) + (b.text ? textWidth(b.text, BADGE_SIZE) : 0);

/* Badges wrap rather than being dropped — the card's own .nodecard__badges does,
 * and a relationship count silently vanishing is worse than a taller card. */
function badgeLines(badges, maxW) {
  const lines = [];
  let line = [];
  let used = 0;
  for (const b of badges) {
    const w = badgeW(b);
    if (line.length && used + BADGE_GAP + w > maxW) {
      lines.push(line);
      line = [];
      used = 0;
    }
    line.push(b);
    used += (line.length > 1 ? BADGE_GAP : 0) + w;
  }
  if (line.length) lines.push(line);
  return lines;
}

/* ------------------------------------------------------------------ layout */

function layout(blocks, logo) {
  const placed = new Map();
  const bands = [];
  const rows = []; // every row of the whole drawing, top to bottom
  let y = MARGIN;

  for (const block of blocks) {
    const bandTop = y;
    let cy = bandTop + BAND_PAD + BAND_HEAD + BAND_HEAD_GAP;
    const rowsOf = [];
    for (let i = 0; i < block.cards.length; i += COLS) rowsOf.push(block.cards.slice(i, i + COLS));

    rowsOf.forEach((cards, r) => {
      const lines = cards.map(card =>
        card.href ? [] : badgeLines(badgesOf(blocks, block.id, card), CARD_W - CARD_PAD * 2)
      );
      const h = Math.max(
        ...cards.map((card, i) => {
          if (card.href) return SEE_ALL_H;
          const rowsOfBadges = lines[i].length;
          const foot = Boolean(card.quality || card.ran);
          return (
            CARD_PAD * 2 +
            MARK +
            (rowsOfBadges
              ? STACK_GAP + rowsOfBadges * BADGE_H + (rowsOfBadges - 1) * BADGE_GAP
              : 0) +
            (foot ? STACK_GAP + FOOT_H : 0)
          );
        })
      );
      cards.forEach((card, c) => {
        placed.set(card.id, {
          card,
          block,
          bandIndex: bands.length,
          badges: lines[c],
          x: colX(c),
          y: cy,
          w: CARD_W,
          h,
          col: c,
          row: rows.length,
        });
      });
      rows.push({ top: cy, bottom: cy + h, band: bands.length });
      cy += h + (r < rowsOf.length - 1 ? ROW_GAP : 0);
    });

    bands.push({ block, top: bandTop, bottom: cy + BAND_PAD });
    y = cy + BAND_PAD + BAND_GAP;
  }
  /* The signature sits under the lanes rather than inside the last one, so it
   * belongs to the drawing and not to Plugins. It is a row with content, not
   * padding: MARGIN still closes the drawing beneath it. */
  const height = y - BAND_GAP + (logo ? BAND_GAP + LOGO_SIZE : 0) + MARGIN;
  return { placed, bands, height };
}

/* ------------------------------------------------------------------ edges */

/* The plugin draws every edge as a React Flow bezier: the curve leaves a card
 * through the handle on one side and enters the next through the handle on the
 * other, with each control point pushed along its handle's normal by half the
 * distance between them (`getBezierPath`, curvature 0.25). Reproduced here
 * rather than routed around anything — in the plugin an edge crosses whatever
 * lies between its ends, and the cards, drawn last, sit over it.
 */

/** React Flow's control offset: half the span forwards, a damped arc backwards. */
const controlOffset = (distance, curvature = 0.25) =>
  distance >= 0 ? 0.5 * distance : curvature * 25 * Math.sqrt(-distance);

/** A bezier leaving downwards and arriving from above — the vertical layout. */
function bezierDown(sx, sy, tx, ty) {
  const c = controlOffset(ty - sy);
  return `M${n(sx)} ${n(sy)} C ${n(sx)} ${n(sy + c)}, ${n(tx)} ${n(ty - c)}, ${n(tx)} ${n(ty)}`;
}

/** A bezier leaving rightwards and arriving from the left — cards side by side. */
function bezierAcross(sx, sy, tx, ty) {
  const c = controlOffset(tx - sx);
  return `M${n(sx)} ${n(sy)} C ${n(sx + c)} ${n(sy)}, ${n(tx - c)} ${n(ty)}, ${n(tx)} ${n(ty)}`;
}

/** A solid arrow head at (x, y), pointing down — the head an edge arrives with. */
const ARROW_HALF = 5.4; // half the head's base
const ARROW_LEN = ARROW_HALF * 1.4; // base to tip

const arrow = (x, y, colour) =>
  `<path d="M${n(x - ARROW_HALF)} ${n(y - ARROW_LEN)}L${n(x)} ${n(y)}L${n(x + ARROW_HALF)} ${n(y - ARROW_LEN)}Z" fill="${colour}"/>`;

/** A wire from a card's bottom handle to the top handle of a card below it. */
/* With heads on, the curve stops where the head starts rather than at the
 * border: run it the whole way and the 2.5px stroke shows through the head's
 * point and past it as a stalk. With heads off there is nothing to make room
 * for, so the curve runs on and lands on the border itself. */
const wirePath = (a, b, heads) =>
  bezierDown(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y - (heads ? ARROW_LEN : 0));

/* Two data marts are relevant to each other. No arrow: the relation has no
 * direction. It always leaves one card's right edge and enters the other's
 * left, the way a relationship edge joins side handles — a bottom-to-top curve
 * between two rows only 16px apart would flatten into a stray horizontal
 * stroke, since the control offset is half the vertical span. */
function relationPath(a, b) {
  const [l, r] = a.col < b.col ? [a, b] : [b, a];
  return bezierAcross(l.x + l.w, l.y + l.h / 2, r.x, r.y + r.h / 2);
}

/* ------------------------------------------------------------------ render */

function card(t, place, blocks, byId, selected, focused) {
  const { card: c, block, x, y, w, h } = place;
  const lit = selected.has(c.id);
  const dim = focused && !lit && !c.href;
  const parts = [];

  if (c.href) {
    /* The way out to the full list: dashed, like the plugin's add card. */
    const label = c.name;
    const labelW = textWidth(label, TITLE_SIZE);
    const inner = 16 + 6 + labelW;
    const ix = x + (w - inner) / 2;
    parts.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="10" fill="${t.band}"/>`,
      `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${n(w - 1)}" height="${n(h - 1)}" rx="10" ` +
        `fill="${t.elevated}" fill-opacity="0.55" stroke="${t.border}" stroke-width="1" stroke-dasharray="5 4"/>`,
      glyph('arrow-right', ix, y + h / 2 - 8, 16, t.muted, 1.75),
      text(ix + 22, y + h / 2, label, { size: TITLE_SIZE, fill: t.muted })
    );
    return `<g><title>${esc(label)}</title>${parts.join('')}</g>`;
  }

  parts.push(
    `<rect x="${n(x + (lit ? 1 : 0.5))}" y="${n(y + (lit ? 1 : 0.5))}" width="${n(w - (lit ? 2 : 1))}" ` +
      `height="${n(h - (lit ? 2 : 1))}" rx="10" fill="${t.elevated}" stroke="${lit ? t.link : t.border}" ` +
      `stroke-width="${lit ? 2 : 1}"/>`
  );
  /* The card's own ground, never dimmed. Group opacity makes a card translucent,
   * and an edge passing behind it would read straight through as a ghost line. */
  const base =
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="10" fill="${t.elevated}"` +
    `${dim ? ` fill-opacity="${DIM_ALPHA}"` : ''}/>`;

  /* The head: a white plate carrying the brand mark, then the name. The mark
   * and the name sit back a quarter unless the card is the chosen one. */
  const headY = y + CARD_PAD;
  const back = lit ? 1 : 0.75;
  const logo = logoOf(c, byId);
  parts.push(
    `<g opacity="${back}"><rect x="${n(x + CARD_PAD)}" y="${n(headY)}" width="${MARK}" height="${MARK}" rx="6" fill="#ffffff"/>` +
      (logo
        ? mark(logo, x + CARD_PAD + (MARK - 16) / 2, headY + (MARK - 16) / 2, 16)
        : glyph(
            c.icon ?? block.icon,
            x + CARD_PAD + (MARK - 14) / 2,
            headY + (MARK - 14) / 2,
            14,
            '#1a1f2e',
            1.75
          )) +
      '</g>'
  );
  const titleX = x + CARD_PAD + MARK + HEAD_GAP;
  const titleMax = w - CARD_PAD * 2 - MARK - HEAD_GAP;
  parts.push(
    text(titleX, headY + MARK / 2, clip(c.name, TITLE_SIZE, titleMax, 500), {
      size: TITLE_SIZE,
      weight: 500,
      fill: t.primary,
      opacity: back,
    })
  );

  /* The badges, wrapping the way .nodecard__badges does. */
  let cy = headY + MARK;
  if (place.badges.length) {
    cy += STACK_GAP;
    place.badges.forEach((line, i) => {
      const ly = cy + i * (BADGE_H + BADGE_GAP);
      let bx = x + CARD_PAD;
      for (const b of line) {
        const bw = badgeW(b);
        parts.push(
          `<rect x="${n(bx)}" y="${n(ly)}" width="${n(bw)}" height="${BADGE_H}" rx="6" fill="${t.nested}"/>`
        );
        let tx = bx + 6;
        if (b.icon) {
          parts.push(glyph(b.icon, tx, ly + (BADGE_H - 12) / 2, 12, t.muted, 1.6));
          tx += 12 + (b.text ? 4 : 0);
        }
        if (b.text) {
          parts.push(text(tx, ly + BADGE_H / 2, b.text, { size: BADGE_SIZE, fill: t.muted }));
        }
        bx += bw + BADGE_GAP;
      }
    });
    cy += place.badges.length * BADGE_H + (place.badges.length - 1) * BADGE_GAP;
  }

  /* The foot: what the thing is sits left, whose it is sits right. */
  const foot = [];
  if (c.quality) {
    foot.push({
      side: 'l',
      icon: c.quality === 'passed' ? 'shield-check' : 'shield-alert',
      colour: c.quality === 'passed' ? t.ok : t.warn,
      title:
        c.quality === 'passed' ? 'Data quality: all checks passed' : 'Data quality: issues found',
    });
    if (c.fresh)
      foot.push({ side: 'l', icon: 'history', colour: t.muted, title: `Freshness: ${c.fresh}` });
    if (c.shared) foot.push({ side: 'r', icon: 'share-2', colour: t.muted, title: c.shared });
    if (c.owners)
      foot.push({
        side: 'r',
        icon: 'users',
        colour: t.muted,
        title: `Owner: ${c.owners.join(', ')}`,
      });
  } else if (c.ran) {
    foot.push({ side: 'l', icon: 'circle-check', colour: t.ok, title: 'Last run succeeded' });
    foot.push({ side: 'l', text: c.ran });
    if (c.owners)
      foot.push({
        side: 'r',
        icon: 'users',
        colour: t.muted,
        title: `Owner: ${c.owners.join(', ')}`,
      });
  }
  if (foot.length) {
    cy += STACK_GAP;
    let lx = x + CARD_PAD;
    for (const f of foot.filter(f => f.side === 'l')) {
      if (f.icon) {
        parts.push(
          `<g><title>${esc(f.title)}</title>${glyph(f.icon, lx, cy + (FOOT_H - 14) / 2, 14, f.colour, 1.75)}</g>`
        );
        lx += 14 + 6;
      } else {
        parts.push(
          text(lx, cy + FOOT_H / 2, clip(f.text, META_SIZE, 70), { size: META_SIZE, fill: t.muted })
        );
        lx += textWidth(f.text, META_SIZE) + 6;
      }
    }
    let rx = x + w - CARD_PAD;
    for (const f of foot.filter(f => f.side === 'r').reverse()) {
      rx -= 14;
      parts.push(
        `<g><title>${esc(f.title)}</title>${glyph(f.icon, rx, cy + (FOOT_H - 14) / 2, 14, f.colour, 1.75)}</g>`
      );
      rx -= 6;
    }
  }

  return (
    `<g><title>${esc(c.name)}</title>${base}` +
    `<g${dim ? ` opacity="${t.dim}"` : ''}>${parts.join('')}</g></g>`
  );
}

/* A layer, the way the plugin draws one: an opaque rounded container a shade
 * under the cards, filling the width, with its header on the first line inside
 * it — a glyph on a small plate, the layer's name, then how many of that thing
 * the project holds. No pill on the border, no rule: the container is the
 * layer, and the cards sit in it. */
function bandBody(t, b) {
  const h = b.bottom - b.top;
  const x = MARGIN;
  return `<rect x="${n(x)}" y="${n(b.top)}" width="${n(WIDTH - 2 * x)}" height="${n(h)}" rx="14" fill="${t.band}"/>`;
}

function bandHead(t, b) {
  const tint = TINT[b.block.id] ?? t.link;
  const top = b.top;
  const plate = 24;
  const hx = PAD;
  const hy = top + BAND_PAD + (BAND_HEAD - plate) / 2;
  const nameX = hx + plate + 10;
  const name = b.block.name;
  const parts = [
    `<rect x="${n(hx)}" y="${n(hy)}" width="${plate}" height="${plate}" rx="7" fill="${t.plate}"/>`,
    glyph(b.block.icon, hx + (plate - 15) / 2, hy + (plate - 15) / 2, 15, tint, 1.9),
    text(nameX, hy + plate / 2, name, { size: 14, weight: 500, fill: t.primary }),
  ];
  /* The count beside the name, as the plugin's header carries it: how many the
   * project holds, not how many this picture had room for. */
  const total = b.showTotals ? b.block.total : undefined;
  if (total) {
    parts.push(
      text(nameX + textWidth(name, 14, 500) + 10, hy + plate / 2, total, {
        size: 12,
        fill: t.muted,
      })
    );
  }
  return parts.join('');
}

/* The OWOX mark and the address, bottom right, under the last lane. The mark
 * leads and the address follows it, the pair right-aligned to the margin every
 * lane edge keeps. */
const SIGNATURE = 'www.owox.com';

function signature(t, show, height) {
  if (!show) return '';
  const size = 12;
  const w = textWidth(SIGNATURE, size);
  const top = height - MARGIN - LOGO_SIZE;
  const textX = WIDTH - MARGIN - w;
  return (
    mark('owox', textX - 8 - LOGO_SIZE, top, LOGO_SIZE) +
    text(textX, top + LOGO_SIZE / 2, SIGNATURE, { size, fill: t.muted })
  );
}

function draw(theme, data) {
  const t = { ...THEMES[theme], dim: DIM[theme] };
  const blocks = data.blocks;
  checkReferences(blocks);
  checkConnectorCounts(blocks);
  const byId = new Map(blocks.flatMap(b => b.cards).map(c => [c.id, c]));
  const { placed, bands, height } = layout(blocks, data.showLogo === true);
  const selected = new Set(data.highlight?.cards ?? []);
  const focused = selected.size > 0;

  /* Grey first, so a blue wire crossing one reads over it. */
  const relations = [];
  const seen = new Set();
  for (const c of blocks.flatMap(b => b.cards)) {
    for (const other of c.related ?? []) {
      const key = c.id < other ? `${c.id}|${other}` : `${other}|${c.id}`;
      if (seen.has(key) || !placed.has(other)) continue;
      seen.add(key);
      relations.push(
        `<path d="${relationPath(placed.get(c.id), placed.get(other))}" fill="none" stroke="${t.decor}" ` +
          `stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.9"/>`
      );
    }
  }

  /* Then the chain: every wire whose two ends are both in the selection.
   * `showArrows` is a schema-level switch: a head says which way the data
   * moves, but a picture whose every edge already runs downwards can read
   * cleaner without them. Absent means on, so an older file keeps its heads. */
  const heads = data.showArrows !== false;
  const wires = [];
  for (const wire of wiresOf(blocks)) {
    if (!selected.has(wire.from) || !selected.has(wire.to)) continue;
    const a = placed.get(wire.from);
    const b = placed.get(wire.to);
    if (!a || !b || b.row <= a.row) continue;
    wires.push(
      `<path d="${wirePath(a, b, heads)}" fill="none" stroke="${t.link}" stroke-width="2.5" stroke-linecap="round"/>` +
        (heads ? arrow(b.x + b.w / 2, b.y, t.link) : '')
    );
  }

  const cards = [...placed.values()].map(p => card(t, p, blocks, byId, selected, focused));

  /* No heading and no key: the drawing is placed under a heading and a
   * paragraph in README.md, and repeating either inside the picture only says
   * it twice. `<title>` stays — it is the accessible name, never drawn. */
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${n(height)}" viewBox="0 0 ${WIDTH} ${n(height)}" role="img" aria-labelledby="t">`,
    `<title id="t">${esc(data.title)}</title>`,
    `<rect width="${WIDTH}" height="${n(height)}" rx="16" fill="${t.page}"/>`,
    bands.map(b => bandBody(t, b)).join(''),
    relations.join(''),
    wires.join(''),
    cards.join(''),
    bands.map(b => bandHead(t, { ...b, showTotals: data.showTotals })).join(''),
    signature(t, data.showLogo === true, height),
    '</svg>',
    '',
  ].join('\n');
}

/* -------------------------------------------------------------------- main */

const data = JSON.parse(readFileSync(join(RES, 'architecture.json'), 'utf8'));
const check = process.argv.includes('--check');
let stale = false;

for (const theme of ['dark', 'light']) {
  const file = join(RES, `architecture-${theme}.svg`);
  const svg = draw(theme, data);
  if (check) {
    const was = (() => {
      try {
        return readFileSync(file, 'utf8');
      } catch {
        return null;
      }
    })();
    if (was !== svg) {
      stale = true;
      console.error(`stale: docs/res/architecture/architecture-${theme}.svg`);
    }
    continue;
  }
  writeFileSync(file, svg);
  console.log(
    `wrote docs/res/architecture/architecture-${theme}.svg (${svg.length.toLocaleString('en-US')} bytes)`
  );
}

if (check && stale) {
  console.error('Run `npm run generate:architecture` and commit the result.');
  process.exit(1);
}
