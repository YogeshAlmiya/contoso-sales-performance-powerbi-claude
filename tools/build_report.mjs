// Generates the Contoso Sales 2025 IBCS leadership report (PBIR) from the approved spec in _brief/report-spec.md.
// Run: node tools/build_report.mjs   (then validate with powerbi-report-author validate "Contoso Sales.Report")
// Rewrites definition/pages and the custom theme; everything else in the .Report folder is kept.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const REPORT = path.join(ROOT, "Contoso Sales.Report");
const DEF = path.join(REPORT, "definition");
const VISUAL_SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.9.0/schema.json";
const PAGE_SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json";

// ---------------------------------------------------------------- design tokens (spec section 2)
const NAVY = "#0B1530", NAVY_ACTIVE = "#1F2D52", NAVY_HOVER = "#16224A", NAV_TEXT = "#C9D1E3", CAPS = "#9AA6C4";
const CANVAS = "#F3F4F6", PANEL = "#FFFFFF", TEXT = "#1A1A1A", TEXT2 = "#4B5563", GREY = "#6B7280", STRIPE = "#F7F7F8";
// IBCS: AC solid charcoal, PY solid grey, BU outlined, FC hatched (tinted with an outline in native charts)
const AC = "#1F1F1F", PY = "#A6A6A6", GOOD = "#3F8A54", BAD = "#B83A3A", GOOD_LIGHT = "#9CC5A6", BAD_LIGHT = "#E3A3A3";
const W = 1920, H = 1080;
// Grid: navy sidebar, then content from x 312 to 1888 and y 132 to 1056 with 24 px gaps
const SIDEBAR = 280, X0 = 312, Y0 = 132, G = 24;
const T_HEADLINE = 22, T_TITLE = 12, T_LABEL = 11, T_SUB = 10;

// ---------------------------------------------------------------- encoding helpers
const hex = (seed, n = 20) => crypto.createHash("sha1").update(seed).digest("hex").slice(0, n);
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const str = (s) => lit(`'${s}'`);
const num = (n) => lit(`${n}D`);
const int = (n) => lit(`${n}L`);
const bool = (b) => lit(b ? "true" : "false");
const color = (c) => ({ solid: { color: lit(`'${c}'`) } });
const props = (p, selector) => (selector ? { properties: p, selector } : { properties: p });
const ALL_POINTS = { data: [{ dataViewWildcard: { matchingOption: 1 } }] };

const measureExpr = (m) => ({ Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: m } });
const columnExpr = (t, c) => ({ Column: { Expression: { SourceRef: { Entity: t } }, Property: c } });
const mProj = (m, displayName) => ({ field: measureExpr(m), queryRef: `Sales.${m}`, nativeQueryRef: m, ...(displayName ? { displayName } : {}) });
const cProj = (t, c, displayName) => ({ field: columnExpr(t, c), queryRef: `${t}.${c}`, nativeQueryRef: c, ...(displayName ? { displayName } : {}) });
const sortBy = (field, direction) => ({ sort: [{ field, direction }], isDefaultSort: true });

// Colour by the sign of a variance measure. invert: a rise is bad (unit cost). light: forecast variances.
// zero: values within +/- zero count as zero and are grey (e.g. 50000 for amounts shown as $0.0M).
function signColor(m, { invert = false, light = false, zero = 0, neutral = TEXT2 } = {}) {
  const up = light ? GOOD_LIGHT : GOOD, down = light ? BAD_LIGHT : BAD;
  const [pos, neg] = invert ? [down, up] : [up, down];
  const when = (kind, limit, value) => ({ Condition: { Comparison: { ComparisonKind: kind, Left: measureExpr(m), Right: { Literal: { Value: `${limit}D` } } } }, Value: { Literal: { Value: `'${value}'` } } });
  return { solid: { color: { expr: { Conditional: { Cases: [when(1, zero, pos), when(3, -zero, neg)], DefaultValue: { Literal: { Value: `'${neutral}'` } } } } } } };
}

// Every page shows 2025 only: a hidden, locked page filter, so it also reaches images and cards
const yearFilter = (seed) => ({
  filters: [{
    name: "Filter" + hex(seed + "year", 24),
    field: columnExpr("Date", "Year"),
    type: "Categorical",
    filter: {
      Version: 2,
      From: [{ Name: "d", Entity: "Date", Type: 0 }],
      Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: "d" } }, Property: "Year" } }], Values: [[{ Literal: { Value: "2025L" } }]] } } }],
    },
    howCreated: "User",
    isHiddenInViewMode: true,
    isLockedInViewMode: true,
  }],
});

const titleText = (t) => (typeof t === "string" ? str(t) : { expr: measureExpr(t.measure) });
const noPadding = [props({ top: num(0), bottom: num(0), left: num(0), right: num(0) })];
const off = [props({ show: bool(false) })];

// White panel on the grey canvas: rounded corners, no border line, no shadow.
// Titles are set to 12pt here: Desktop renders container titles at 14pt whatever the theme's title classes say.
function panelVco(title, { tooltip = false, padding = true } = {}) {
  const vco = {
    title: title
      ? [props({ show: bool(true), text: titleText(title), fontFamily: str("Segoe UI Semibold"), fontSize: num(T_TITLE), fontColor: color(TEXT) })]
      : off,
    subTitle: off,
    background: [props({ show: bool(true), color: color(PANEL), transparency: num(0) })],
    border: [props({ show: bool(true), color: color(PANEL), radius: num(8), width: num(1) })],
    dropShadow: off,
    padding: padding ? [props({ top: num(12), bottom: num(12), left: num(16), right: num(16) })] : noPadding,
    visualHeader: off,
  };
  if (tooltip) vco.visualTooltip = [props({ show: bool(true), type: str("Canvas"), section: str(TOOLTIP_ID) })];
  return vco;
}
const bareVco = { title: off, subTitle: off, background: off, border: off, dropShadow: off, padding: noPadding, visualHeader: off };

// Responsive charts shrink their text when the visual is small; keep the theme's font sizes instead
const FIXED_TEXT = [props({ responsive: bool(false) })];

// ---------------------------------------------------------------- pages and ids
const PAGES = [
  { key: "overview", name: "Overview", headline: "Headline Overview", subtitle: "Subtitle" },
  { key: "channels", name: "Channels", headline: "Headline Channels", subtitle: "Subtitle" },
  { key: "products", name: "Products", headline: "Headline Products", subtitle: "Subtitle Products" },
  { key: "regions", name: "Regions", headline: "Headline Regions", subtitle: "Subtitle" },
  { key: "margin", name: "Margin", headline: "Headline Margin", subtitle: "Subtitle Margin" },
  { key: "outlook", name: "Outlook", headline: "Headline Outlook", subtitle: "Subtitle Outlook" },
];
const pageId = (key) => hex(`page/${key}`);
const TOOLTIP_ID = pageId("tooltip");

// ---------------------------------------------------------------- visual builders
function container(seed, kind, pos, visual, extra = {}) {
  return { name: hex(seed), position: { x: pos.x, y: pos.y, z: pos.z ?? 1000, height: pos.h, width: pos.w, tabOrder: pos.z ?? 1000 }, visual: { visualType: kind, ...visual }, ...extra };
}

function rect(seed, fill, pos) {
  return container(seed, "shape", pos, {
    objects: {
      shape: [props({ tileShape: str("rectangle") }, { id: "default" })],
      fill: [props({ fillColor: color(fill), transparency: num(0) }, { id: "default" })],
      outline: [props({ show: bool(false) }, { id: "default" })],
    },
    visualContainerObjects: bareVco,
  });
}

function textLine(seed, text, style, pos) {
  return container(seed, "textbox", pos, {
    objects: { general: [props({ paragraphs: [{ textRuns: [{ value: text, textStyle: { fontFamily: style.font ?? "Segoe UI", fontSize: `${style.size}pt`, color: style.color } }], horizontalTextAlignment: "left" }] })] },
    visualContainerObjects: bareVco,
  });
}

// Card chrome off: no tile fill (fillCustom defaults to white), outline or accent bar
// (show flags take effect only in an entry without a selector, as for buttons)
const hidden = [props({ show: bool(false) }), props({ show: bool(false) }, { id: "default" })];
const bareCard = {
  label: hidden,
  fillCustom: hidden,
  padding: [props({ paddingUniform: int(0) }, { id: "default" })],
  layout: [props({ paddingUniform: int(0), backgroundShow: bool(false) }, { id: "default" })],
  outline: hidden,
  accentBar: hidden,
};

// A short text measure shown as a left-aligned card value: tooltip lines.
// Cards are data visuals, so clicks on charts filter them and the text rewrites.
function textCard(seed, m, pos, style) {
  return container(seed, "cardVisual", pos, {
    query: { queryState: { Data: { projections: [mProj(m)] } } },
    objects: {
      ...bareCard,
      value: [props({ fontFamily: str(style.font ?? "Segoe UI"), fontSize: num(style.size), fontColor: color(style.color), bold: bool(!!style.bold), horizontalAlignment: str("left"), textWrap: bool(true) }, { id: "default" })],
    },
    visualContainerObjects: bareVco,
  });
}

// Page headline and subtitle: the container title and subtitle of a card bound to the headline measure.
// Card values cut long text with "..."; container titles wrap, so a long headline runs to a second line.
function headlineCard(seed, headline, subtitle, pos) {
  return container(seed, "cardVisual", pos, {
    query: { queryState: { Data: { projections: [mProj(headline)] } } },
    objects: { ...bareCard, value: hidden },
    visualContainerObjects: {
      ...bareVco,
      title: [props({ show: bool(true), text: titleText({ measure: headline }), fontFamily: str("Segoe UI"), fontSize: num(T_HEADLINE), fontColor: color(TEXT), bold: bool(false), titleWrap: bool(true) })],
      subTitle: [props({ show: bool(true), text: titleText({ measure: subtitle }), fontFamily: str("Segoe UI"), fontSize: num(T_SUB), fontColor: color(GREY), titleWrap: bool(true) })],
    },
  });
}

// SVG chart drawn by a DAX measure (dataCategory ImageUrl), shown 1:1 in a standard image visual
function svgImage(seed, m, alt, pos, { panel = true } = {}) {
  return container(seed, "image", pos, {
    objects: {
      image: [props({ sourceType: str("imageData"), sourceField: { expr: measureExpr(m) }, fit: str("Fit"), altText: str(alt) })],
    },
    visualContainerObjects: panel ? panelVco(null, { padding: false }) : bareVco,
    drillFilterOtherVisuals: true,
  });
}

function navButton(seed, label, target, active, pos) {
  return container(seed, "actionButton", pos, {
    objects: {
      icon: off,
      text: [
        props({ show: bool(true) }),
        props({ text: str(label), fontFamily: str(active ? "Segoe UI Semibold" : "Segoe UI"), fontSize: num(12), fontColor: color(active ? "#FFFFFF" : NAV_TEXT), horizontalAlignment: str("left"), leftMargin: int(16) }, { id: "default" }),
        props({ fontColor: color("#FFFFFF") }, { id: "hover" }),
      ],
      fill: [
        props({ show: bool(true) }),
        props({ fillColor: color(active ? NAVY_ACTIVE : NAVY), transparency: num(0) }, { id: "default" }),
        props({ fillColor: color(active ? NAVY_ACTIVE : NAVY_HOVER), transparency: num(0) }, { id: "hover" }),
      ],
      outline: off,
      shape: [props({ tileShape: str("rectangleRounded"), roundEdge: int(6) }), props({ tileShape: str("rectangleRounded") }, { id: "default" })],
    },
    visualContainerObjects: {
      ...bareVco,
      visualLink: [props({ show: bool(true), type: str("PageNavigation"), navigationSection: str(target), tooltip: str(`Go to ${label}`) })],
    },
    drillFilterOtherVisuals: true,
  });
}

// Compare with: PY | BU | FC square buttons; unselected navy, selected white with navy text; saved on BU
const BU_SELECTED = {
  Version: 2,
  From: [{ Name: "c", Entity: "Comparison", Type: 0 }],
  Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: "c" } }, Property: "Comparison" } }], Values: [[{ Literal: { Value: "'BU'" } }]] } } }],
};
function compareSlicer(seed, pos) {
  const state = (dflt, sel) => [props(dflt, { id: "default" }), props(sel, { id: "selected" })];
  return container(seed, "advancedSlicerVisual", pos, {
    syncGroup: { groupName: "ComparisonSync", fieldChanges: true, filterChanges: true },
    query: { queryState: { Values: { projections: [cProj("Comparison", "Comparison")] } } },
    objects: {
      general: [props({ filter: { filter: BU_SELECTED } })],
      layout: [props({ rowCount: int(1), columnCount: int(3), cellPadding: int(8) })],
      selection: [props({ singleSelect: bool(true), strictSingleSelect: bool(true), selectAllCheckboxEnabled: bool(false) })],
      value: state({ fontFamily: str("Segoe UI Semibold"), fontSize: num(12), fontColor: color("#FFFFFF"), horizontalAlignment: str("center") }, { fontColor: color(NAVY), bold: bool(true) }),
      // The button tile is fillCustom; the inner background is switched off.
      // Desktop applies the default state but ignores the "selected" entries (also from the theme), so the selected
      // button shows Desktop's own dark fill instead of white with navy text.
      fillCustom: [
        props({ show: bool(true) }),
        props({ fillColor: color(NAVY_ACTIVE), transparency: num(0) }, { id: "default" }),
        props({ fillColor: color("#2A3A66"), transparency: num(0) }, { id: "hover" }),
        props({ fillColor: color("#FFFFFF"), transparency: num(0) }, { id: "selected" }),
      ],
      background: state({ show: bool(false) }, { show: bool(false) }),
      outline: state({ show: bool(false) }, { show: bool(false) }),
      label: [props({ show: bool(false) }, { id: "default" })],
      selectionIcon: state({ show: bool(false) }, { show: bool(false) }),
    },
    visualContainerObjects: bareVco,
  });
}

// Compact dropdown with a small grey header, top right of every page
function dropdown(seed, table, column, label, group, pos) {
  return container(seed, "slicer", pos, {
    syncGroup: { groupName: group, fieldChanges: true, filterChanges: true },
    query: { queryState: { Values: { projections: [cProj(table, column)] } } },
    objects: {
      data: [props({ mode: str("Dropdown") })],
      header: [props({ show: bool(true), text: str(label), fontFamily: str("Segoe UI"), textSize: num(9), fontColor: color(GREY) })],
      items: [props({ fontFamily: str("Segoe UI"), textSize: num(T_LABEL), fontColor: color(TEXT), background: color(PANEL) })],
    },
    visualContainerObjects: bareVco,
  });
}

// Native variance bars, red/green by sign with matching labels, sorted with the biggest gap on top; clickable
function varianceBars(seed, category, m, title, pos, opts = {}) {
  const fill = signColor(m, opts);
  const labelColor = signColor(m, { ...opts, light: false });
  const millions = !m.endsWith("%") && !m.endsWith("pp");
  const labelProps = millions
    ? { show: bool(true), labelDisplayUnits: num(1000000), labelPrecision: int(1), labelPosition: str("OutsideEnd") }
    : { show: bool(true), labelPrecision: int(1), labelPosition: str("OutsideEnd") };
  return container(seed, "clusteredBarChart", pos, {
    query: { queryState: { Category: { projections: [category] }, Y: { projections: [mProj(m)] } }, sortDefinition: sortBy(measureExpr(m), "Ascending") },
    objects: {
      dataPoint: [props({ fill }, ALL_POINTS)],
      labels: [props(labelProps), props({ color: labelColor }, ALL_POINTS)],
      legend: off,
      // long names such as Music, Movies and Audio Books need up to 60% of a 444 px chart
      categoryAxis: [props({ show: bool(true), showAxisTitle: bool(false), gridlineShow: bool(false), maxMarginFactor: int(60) })],
      valueAxis: [props({ show: bool(false), gridlineShow: bool(false), showAxisTitle: bool(false) })],
      general: FIXED_TEXT,
    },
    visualContainerObjects: panelVco(title, { tooltip: true }),
  });
}

// Scenario bars per measure in IBCS notation; only AC is labelled
const scenarioDataPoint = (measures) => measures.map((m) => {
  const s = { metadata: `Sales.${m}` };
  if (m === "AC") return props({ fill: color(AC), borderShow: bool(false) }, s);
  if (m === "PY") return props({ fill: color(PY), borderShow: bool(false) }, s);
  if (m === "BU") return props({ fill: color(PANEL), borderShow: bool(true), borderColor: color(AC), borderSize: num(1.5) }, s);
  return props({ fill: color(AC), fillTransparency: num(70), borderShow: bool(true), borderColor: color(AC), borderSize: num(1.5) }, s); // FC: tinted AC with outline, standing in for IBCS hatching
});

function scenarioBars(seed, category, measures, title, pos) {
  const labels = [props({ show: bool(true), labelDisplayUnits: num(1000000), labelPrecision: int(1), labelPosition: str("OutsideEnd") })];
  for (const m of measures) if (m !== "AC") labels.push(props({ show: bool(false) }, { metadata: `Sales.${m}` }));
  return container(seed, "clusteredBarChart", pos, {
    query: { queryState: { Category: { projections: [category] }, Y: { projections: measures.map((m) => mProj(m)) } }, sortDefinition: sortBy(measureExpr("AC"), "Descending") },
    objects: {
      dataPoint: scenarioDataPoint(measures),
      labels,
      legend: [props({ show: bool(true), position: str("Top"), showTitle: bool(false) })],
      // less space between categories than the default, so the AC/PY/BU bars are thick enough to read
      categoryAxis: [props({ show: bool(true), showAxisTitle: bool(false), gridlineShow: bool(false), innerPadding: int(12) })],
      valueAxis: [props({ show: bool(false), gridlineShow: bool(false), showAxisTitle: bool(false), start: num(0) })],
      layout: [props({ clusteredGapSize: num(0) })],
      general: FIXED_TEXT,
    },
    visualContainerObjects: panelVco(title, { tooltip: true }),
  });
}

// The rates move within half a point, so the y-axis is shown with labels (it does not start at zero).
// Only the last AC and PY values are labelled: two label-only series that are blank except in the last month.
function marginRateLine(seed, title, pos) {
  const lines = [["Gross Margin %", "AC", AC], ["Gross Margin % PY", "PY", PY]];
  const ends = [["Gross Margin % Last Month", "AC", AC, "Above"], ["Gross Margin % PY Last Month", "PY", PY, "Under"]];
  const sel = (m) => ({ metadata: `Sales.${m}` });
  return container(seed, "lineChart", pos, {
    query: {
      queryState: { Category: { projections: [cProj("Date", "Month")] }, Y: { projections: [...lines, ...ends].map(([m, name]) => mProj(m, name)) } },
      sortDefinition: sortBy(columnExpr("Date", "Month"), "Ascending"),
    },
    objects: {
      dataPoint: [...lines, ...ends].map(([m, , c]) => props({ fill: color(c) }, sel(m))),
      lineStyles: [
        props({ strokeWidth: num(2), showMarker: bool(true), markerSize: num(4), lineChartType: str("linear") }),
        ...ends.map(([m]) => props({ showMarker: bool(false), strokeShow: bool(false) }, sel(m))),
      ],
      labels: [
        props({ show: bool(true), labelPrecision: int(1) }),
        ...lines.map(([m]) => props({ show: bool(false) }, sel(m))),
        ...ends.map(([m, , c, at]) => props({ show: bool(true), labelPosition: str(at), color: color(c === AC ? TEXT : GREY) }, sel(m))),
      ],
      legend: off,
      seriesLabels: [props({ show: bool(true), seriesPosition: str("Right") }), ...ends.map(([m]) => props({ show: bool(false) }, sel(m)))],
      categoryAxis: [props({ show: bool(true), showAxisTitle: bool(false), gridlineShow: bool(false) })],
      valueAxis: [props({ show: bool(true), gridlineShow: bool(false), showAxisTitle: bool(false), labelPrecision: int(1) })],
      general: FIXED_TEXT,
    },
    visualContainerObjects: panelVco(title),
  });
}

// Products driver table: Δ vs the chosen comparison, then units, price and cost vs PY (the plan has no units)
function driverTable(seed, pos) {
  const cols = [
    ["AC", "Sales AC"], ["ΔCMP", "Δ"], ["ΔCMP %", "Δ %"], ["Units ΔPY %", "Units ΔPY %"],
    ["Avg Net Price ΔPY %", "Avg. price ΔPY %"], ["Avg Unit Cost ΔPY %", "Unit cost ΔPY %"], ["Gross Margin % ΔPY pp", "Margin % ΔPY"],
  ];
  const signed = cols.slice(1).map(([m]) => props({ fontColor: signColor(m, { invert: m === "Avg Unit Cost ΔPY %" }) }, { ...ALL_POINTS, metadata: `Sales.${m}` }));
  // every number column: header right-aligned over its values; the $ columns in $M
  const numbers = cols.map(([m]) => props({
    alignment: str("Right"), styleHeader: bool(true), styleValues: bool(true),
    ...(["AC", "ΔCMP"].includes(m) ? { labelDisplayUnits: str("1000000"), labelPrecision: int(1) } : {}),
  }, { metadata: `Sales.${m}` }));
  return container(seed, "tableEx", pos, {
    query: { queryState: { Values: { projections: [cProj("Product", "Category"), ...cols.map(([m, n]) => mProj(m, n))] } }, sortDefinition: sortBy(measureExpr("ΔCMP"), "Ascending") },
    objects: {
      columnHeaders: [props({ fontColor: color(GREY), backColor: color(PANEL), autoSizeColumnWidth: bool(true), columnAdjustment: str("growToFit"), wordWrap: bool(true) })],
      values: [props({ backColorPrimary: color(PANEL), backColorSecondary: color(STRIPE), fontColorPrimary: color(TEXT), fontColorSecondary: color(TEXT) }), ...signed],
      columnFormatting: numbers,
      grid: [props({ gridHorizontal: bool(false), gridVertical: bool(false), rowPadding: num(7) })],
      total: [props({ fontColor: color(TEXT), fontFamily: str("Segoe UI Semibold"), bold: bool(false), backColor: color(PANEL) })],
    },
    visualContainerObjects: { ...panelVco({ measure: "Title driver table" }, { tooltip: true }), stylePreset: [props({ name: str("None") })] },
  });
}

// Regions: country x category variance in red/green text; values that show as $0.0M are grey
function varianceMatrix(seed, rows, columns, m, title, pos) {
  return container(seed, "pivotTable", pos, {
    query: { queryState: { Rows: { projections: [rows] }, Columns: { projections: [columns] }, Values: { projections: [mProj(m)] } }, sortDefinition: sortBy(measureExpr(m), "Ascending") },
    objects: {
      columnHeaders: [props({ fontColor: color(GREY), backColor: color(PANEL), wordWrap: bool(true), autoSizeColumnWidth: bool(true), columnAdjustment: str("growToFit"), alignment: str("Right") })],
      rowHeaders: [props({ fontColor: color(TEXT), backColor: color(PANEL) })],
      values: [
        props({ backColorPrimary: color(PANEL), backColorSecondary: color(PANEL), fontColorPrimary: color(TEXT), fontColorSecondary: color(TEXT) }),
        props({ fontColor: signColor(m, { zero: 50000 }) }, { ...ALL_POINTS, metadata: `Sales.${m}` }),
      ],
      columnFormatting: [props({ labelDisplayUnits: str("1000000"), labelPrecision: int(1) }, { metadata: `Sales.${m}` })],
      grid: [props({ gridHorizontal: bool(false), gridVertical: bool(false), rowPadding: num(7) })],
      total: [props({ fontColor: color(TEXT), fontFamily: str("Segoe UI Semibold"), bold: bool(false), backColor: color(PANEL) })],
    },
    visualContainerObjects: { ...panelVco(title, { tooltip: true }), stylePreset: [props({ name: str("None") })] },
  });
}

// ---------------------------------------------------------------- shell: sidebar and header
function sidebar(page) {
  const k = page.key;
  const active = PAGES.findIndex((p) => p.key === k);
  const navY = (i) => 120 + i * 52;
  return [
    rect(`${k}/sidebar`, NAVY, { x: 0, y: 0, w: SIDEBAR, h: H, z: 0 }),
    textLine(`${k}/brand_caps`, "CONTOSO ELECTRONICS", { size: 9, color: CAPS, font: "Segoe UI Semibold" }, { x: 24, y: 28, w: 232, h: 20, z: 100 }),
    textLine(`${k}/brand`, "Sales Performance", { size: 16, color: "#FFFFFF", font: "Segoe UI Semibold" }, { x: 24, y: 50, w: 232, h: 34, z: 110 }),
    ...PAGES.map((p, i) => navButton(`${k}/nav_${p.key}`, p.name, pageId(p.key), i === active, { x: 16, y: navY(i), w: 248, h: 44, z: 200 + i })),
    rect(`${k}/nav_marker`, "#FFFFFF", { x: 16, y: navY(active), w: 3, h: 44, z: 300 }),
    textLine(`${k}/compare_caps`, "COMPARE WITH", { size: 9, color: CAPS, font: "Segoe UI Semibold" }, { x: 24, y: 452, w: 232, h: 20, z: 400 }),
    compareSlicer(`${k}/compare`, { x: 16, y: 476, w: 248, h: 64, z: 410 }),
    svgImage(`${k}/legend`, "IBCS Legend SVG", "IBCS notation: AC actual solid, FC forecast hatched, BU budget outlined, PY previous year grey, variances green and red", { x: 16, y: 872, w: 248, h: 176, z: 420 }, { panel: false }),
  ];
}

function header(page) {
  const k = page.key;
  return [
    headlineCard(`${k}/headline`, page.headline, page.subtitle, { x: X0, y: 12, w: 1136, h: 112, z: 500 }),
    dropdown(`${k}/slicer_channel`, "Store", "Channel", "Channel", "ChannelSync", { x: 1472, y: 16, w: 196, h: 76, z: 520 }),
    dropdown(`${k}/slicer_country`, "Store", "Country", "Country", "CountrySync", { x: 1692, y: 16, w: 196, h: 76, z: 530 }),
  ];
}

// ---------------------------------------------------------------- page content (spec section 3)
const channel = cProj("Store", "Channel");
const country = cProj("Store", "Country");
const category = cProj("Product", "Category");

const CONTENT = {
  overview: (k) => [
    ...[
      ["KPI Sales SVG", "Sales AC 2025 with variance vs the chosen comparison and PY"],
      ["KPI Margin SVG", "Gross margin AC 2025 vs last year"],
      ["KPI Margin % SVG", "Gross margin rate AC 2025 vs last year"],
      ["KPI FC SVG", "Full-year forecast FC 6+6 vs budget and last year"],
    ].map(([m, alt], i) => svgImage(`${k}/tile${i}`, m, alt, { x: X0 + i * (376 + G), y: Y0, w: 376, h: 132, z: 1000 + i })),
    svgImage(`${k}/hero`, "Monthly Hero SVG", "Sales by month 2025: AC vs BU or FC and PY, with monthly variance vs the chosen comparison", { x: X0, y: 288, w: 1000, h: 768, z: 2000 }),
    varianceBars(`${k}/channel`, channel, "ΔCMP", { measure: "Title Δ by channel" }, { x: 1336, y: 288, w: 552, h: 232, z: 3000 }),
    varianceBars(`${k}/category`, category, "ΔCMP", { measure: "Title Δ by category" }, { x: 1336, y: 544, w: 552, h: 512, z: 4000 }),
  ],
  channels: (k) => [
    scenarioBars(`${k}/levels`, channel, ["AC", "PY", "BU"], "Sales | USD m | AC, PY, BU | by channel", { x: X0, y: Y0, w: 760, h: 380, z: 1000 }),
    varianceBars(`${k}/delta2`, channel, "ΔCMP2", { measure: "Title Δ2 by channel" }, { x: 1096, y: Y0, w: 384, h: 380, z: 2000 }),
    varianceBars(`${k}/delta`, channel, "ΔCMP", { measure: "Title Δ by channel" }, { x: 1504, y: Y0, w: 384, h: 380, z: 3000 }),
    svgImage(`${k}/monthly`, "Focus Channel Monthly SVG", "Sales by month for the clicked channel, or the one with the biggest variance", { x: X0, y: 536, w: 1000, h: 520, z: 4000 }),
    varianceBars(`${k}/focus_category`, category, "ΔCMP Focus Channel", { measure: "Title focus channel by category" }, { x: 1336, y: 536, w: 552, h: 520, z: 5000 }),
  ],
  products: (k) => [
    scenarioBars(`${k}/levels`, category, ["AC", "PY", "BU"], "Sales | USD m | AC, PY, BU | by product category", { x: X0, y: Y0, w: 640, h: 420, z: 1000 }),
    varianceBars(`${k}/delta`, category, "ΔCMP", { measure: "Title Δ by category" }, { x: 976, y: Y0, w: 444, h: 420, z: 2000 }),
    varianceBars(`${k}/delta_pct`, category, "ΔCMP %", { measure: "Title Δ % by category" }, { x: 1444, y: Y0, w: 444, h: 420, z: 3000 }),
    driverTable(`${k}/drivers`, { x: X0, y: 576, w: 1576, h: 480, z: 4000 }),
  ],
  regions: (k) => [
    scenarioBars(`${k}/levels`, country, ["AC", "PY", "BU"], "Sales | USD m | AC, PY, BU | by country", { x: X0, y: Y0, w: 640, h: 420, z: 1000 }),
    varianceBars(`${k}/delta`, country, "ΔCMP", { measure: "Title Δ by country" }, { x: 976, y: Y0, w: 444, h: 420, z: 2000 }),
    varianceBars(`${k}/delta_pct`, country, "ΔCMP %", { measure: "Title Δ % by country" }, { x: 1444, y: Y0, w: 444, h: 420, z: 3000 }),
    varianceMatrix(`${k}/matrix`, country, category, "ΔCMP", { measure: "Title category matrix" }, { x: X0, y: 576, w: 1576, h: 480, z: 4000 }),
  ],
  margin: (k) => [
    svgImage(`${k}/bridge`, "Margin Bridge SVG", "Gross margin bridge from PY to AC: volume, product mix, price and unit cost", { x: X0, y: Y0, w: 1000, h: 924, z: 1000 }),
    varianceBars(`${k}/rate_category`, category, "Gross Margin % ΔPY pp", "Margin rate | pp | ΔPY | by product category", { x: 1336, y: Y0, w: 552, h: 450, z: 2000 }),
    marginRateLine(`${k}/rate_month`, "Margin rate | % | AC vs PY | 2025 by month (axis does not start at 0)", { x: 1336, y: 606, w: 552, h: 450, z: 3000 }),
  ],
  outlook: (k) => [
    svgImage(`${k}/monthly`, "Outlook Monthly SVG", "Sales by month 2025: AC and the June forecast FC 6+6 (hatched, Jul-Dec) vs PY, with AC minus FC beneath", { x: X0, y: Y0, w: 1000, h: 924, z: 1000 }),
    svgImage(`${k}/pace`, "Outlook Pace SVG", "Sales vs last year: H1 actual, H2 forecast and H2 actual", { x: 1336, y: Y0, w: 552, h: 220, z: 2000 }),
    varianceBars(`${k}/fc_channel`, channel, "ΔFC", "Sales | USD m | ΔFC (AC − FC) | by channel", { x: 1336, y: 376, w: 552, h: 220, z: 3000 }, { light: true }),
    varianceBars(`${k}/fc_category`, category, "ΔFC", "Sales | USD m | ΔFC (AC − FC) | by product category", { x: 1336, y: 620, w: 552, h: 436, z: 4000 }, { light: true }),
  ],
};

// Tooltip page for every native chart: item name, one-line summary, mini monthly chart
const TOOLTIP_W = 480, TOOLTIP_H = 320;
const tooltipVisuals = () => [
  textCard("tooltip/title", "Tooltip Title", { x: 8, y: 6, w: 464, h: 30, z: 1000 }, { size: 13, color: TEXT, font: "Segoe UI Semibold" }),
  textCard("tooltip/summary", "Tooltip Summary", { x: 8, y: 36, w: 464, h: 24, z: 1010 }, { size: T_SUB, color: GREY }),
  svgImage("tooltip/chart", "Tooltip Monthly SVG", "Sales by month for the hovered item, AC vs the chosen comparison", { x: 8, y: 68, w: 464, h: 236, z: 1020 }, { panel: false }),
];

// ---------------------------------------------------------------- theme
function buildTheme() {
  const theme = {
    name: "ContosoIBCS",
    dataColors: [AC, PY, "#7F7F7F", "#D1D5DB", GOOD, BAD, "#9CA3AF", "#000000"],
    good: GOOD, neutral: "#A6A6A6", bad: BAD,
    maximum: AC, center: "#A6A6A6", minimum: "#F2F2F2", null: "#D9D9D9",
    background: PANEL, foreground: TEXT, tableAccent: AC,
    firstLevelElements: TEXT, secondLevelElements: TEXT2,
    // Type scale: visual titles 12pt semibold (largeTitle), axes, legends, tables and data labels 11pt.
    // Headlines (22pt) and subtitles (10pt) are card values, sized on the card.
    textClasses: {
      callout: { fontSize: T_HEADLINE, fontFace: "Segoe UI", color: TEXT },
      title: { fontSize: T_LABEL, fontFace: "Segoe UI Semibold", color: TEXT },
      largeTitle: { fontSize: T_TITLE, fontFace: "Segoe UI Semibold", color: TEXT },
      header: { fontSize: T_LABEL, fontFace: "Segoe UI Semibold", color: TEXT },
      label: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT },
      semiboldLabel: { fontSize: T_LABEL, fontFace: "Segoe UI Semibold", color: TEXT },
      largeLabel: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT },
      boldLabel: { fontSize: T_LABEL, fontFace: "Segoe UI Semibold", color: TEXT },
      lightLabel: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT2 },
      largeLightLabel: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT2 },
      smallLabel: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT },
      smallLightLabel: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT },
    },
    visualStyles: {
      "*": {
        "*": {
          border: [{ show: false }],
          dropShadow: [{ show: false }],
          visualHeader: [{ show: false }],
          categoryAxis: [{ gridlineShow: false }],
          valueAxis: [{ gridlineShow: false }],
        },
      },
      page: { "*": { background: [{ color: { solid: { color: CANVAS } }, transparency: 0 }], outspace: [{ color: { solid: { color: CANVAS } } }] } },
    },
  };
  const body = JSON.stringify(theme, null, 2);
  const file = `ContosoIBCS-${hex(body, 8)}.json`;
  theme.name = file;
  return { file, json: JSON.stringify(theme, null, 2) };
}

// ---------------------------------------------------------------- write
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// Data visuals cross-filter each other (Filter, not Highlight) and filter the headline cards and SVG images.
// Images and cards are never a source: they cannot be clicked.
const NOT_DATA = new Set(["textbox", "shape", "actionButton", "slicer", "advancedSlicerVisual"]);
const NOT_SOURCE = new Set(["image", "cardVisual"]);
function interactions(visuals) {
  const data = visuals.filter((v) => !NOT_DATA.has(v.visual.visualType));
  const out = [];
  for (const s of data) {
    if (NOT_SOURCE.has(s.visual.visualType)) continue;
    for (const t of data) if (s !== t) out.push({ source: s.name, target: t.name, type: "DataFilter" });
  }
  return out;
}

function writePage(id, meta, visuals) {
  const pagesDir = path.join(DEF, "pages");
  const names = visuals.map((v) => v.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) throw new Error(`Duplicate visual names on page ${meta.displayName}: ${dupes.join(", ")}`);
  visuals = visuals.map((v) => ({ $schema: VISUAL_SCHEMA, ...v }));
  writeJson(path.join(pagesDir, id, "page.json"), {
    $schema: PAGE_SCHEMA, name: id, ...meta,
    objects: { background: [props({ color: color(meta.pageBinding ? PANEL : CANVAS), transparency: num(0) })] },
    filterConfig: yearFilter(id),
    visualInteractions: interactions(visuals),
  });
  for (const v of visuals) writeJson(path.join(pagesDir, id, "visuals", v.name, "visual.json"), v);
}

const pagesDir = path.join(DEF, "pages");
fs.rmSync(pagesDir, { recursive: true, force: true });

for (const p of PAGES) {
  writePage(pageId(p.key), { displayName: p.name, displayOption: "FitToPage", height: H, width: W }, [...sidebar(p), ...header(p), ...CONTENT[p.key](p.key)]);
}
// type Tooltip is Desktop's "Allow use as tooltip": without it charts cannot show the page, binding or not
writePage(TOOLTIP_ID, {
  displayName: "Tooltip", displayOption: "ActualSize", height: TOOLTIP_H, width: TOOLTIP_W, type: "Tooltip",
  pageBinding: { name: hex("binding/tooltip"), type: "Tooltip", parameters: [] }, visibility: "HiddenInViewMode",
}, tooltipVisuals());

writeJson(path.join(pagesDir, "pages.json"), {
  $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json",
  pageOrder: [...PAGES.map((p) => pageId(p.key)), TOOLTIP_ID], activePageName: pageId("overview"),
});

// Theme: replace any previous ContosoIBCS theme file and register the new one
const regDir = path.join(REPORT, "StaticResources", "RegisteredResources");
fs.mkdirSync(regDir, { recursive: true });
for (const f of fs.readdirSync(regDir)) if (f.startsWith("ContosoIBCS-")) fs.rmSync(path.join(regDir, f));
const theme = buildTheme();
fs.writeFileSync(path.join(regDir, theme.file), theme.json + "\n", "utf8");

const reportFile = path.join(DEF, "report.json");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const base = report.themeCollection.baseTheme;
report.themeCollection.customTheme = { name: theme.file, reportVersionAtImport: base.reportVersionAtImport, type: "RegisteredResources" };
report.resourcePackages = report.resourcePackages.filter((r) => r.type !== "RegisteredResources");
// Filters pane hidden for readers and collapsed; the hidden, locked Year = 2025 page filters stay in place
report.objects = { ...(report.objects ?? {}), outspacePane: [props({ visible: bool(false), expanded: bool(false) })] };
report.resourcePackages.push({ name: "RegisteredResources", type: "RegisteredResources", items: [{ name: theme.file, path: theme.file, type: "CustomTheme" }] });
writeJson(reportFile, report);

console.log(`Wrote ${PAGES.length} pages and a tooltip page, theme ${theme.file}`);
