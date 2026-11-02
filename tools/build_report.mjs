// Generates the Contoso Sales 2025 leadership report (PBIR) from the approved spec in _brief/report-spec.md.
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

// ---------------------------------------------------------------- IBCS palette
const AC = "#404040", PY = "#C8C8C8", BU_FILL = "#FFFFFF";
const GOOD = "#2E8540", BAD = "#C0392B";
const TEXT = "#252423", TEXT2 = "#605E5C", LINE = "#E1DFDD";
const W = 1920, H = 1080, M = 32, G = 24;
// Type scale (theme text classes) for a 1920 x 1080 canvas read at 100% zoom; visuals inherit it
const T_PAGE = 24, T_TITLE = 14, T_LABEL = 12, T_DATA = 11, T_KPI = 26;

// ---------------------------------------------------------------- encoding helpers
const hex = (seed, n = 20) => crypto.createHash("sha1").update(seed).digest("hex").slice(0, n);
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const str = (s) => lit(`'${s}'`);
const num = (n) => lit(`${n}D`);
const int = (n) => lit(`${n}L`);
const bool = (b) => lit(b ? "true" : "false");
const color = (c) => ({ solid: { color: lit(`'${c}'`) } });
const props = (p, selector) => (selector ? { properties: p, selector } : { properties: p });

const measureExpr = (m) => ({ Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: m } });
const columnExpr = (t, c) => ({ Column: { Expression: { SourceRef: { Entity: t } }, Property: c } });
const mProj = (m, displayName) => ({ field: measureExpr(m), queryRef: `Sales.${m}`, nativeQueryRef: m, ...(displayName ? { displayName } : {}) });
const cProj = (t, c, displayName) => ({ field: columnExpr(t, c), queryRef: `${t}.${c}`, nativeQueryRef: c, ...(displayName ? { displayName } : {}) });

// Red/green by sign of a variance measure
const signColor = (m) => ({
  solid: {
    color: {
      expr: {
        Conditional: {
          Cases: [
            { Condition: { Comparison: { ComparisonKind: 2, Left: measureExpr(m), Right: { Literal: { Value: "0D" } } } }, Value: { Literal: { Value: `'${GOOD}'` } } },
            { Condition: { Comparison: { ComparisonKind: 3, Left: measureExpr(m), Right: { Literal: { Value: "0D" } } } }, Value: { Literal: { Value: `'${BAD}'` } } },
          ],
          DefaultValue: { Literal: { Value: `'${TEXT2}'` } },
        },
      },
    },
  },
});

// Every data visual shows 2025 only (visual-level, hidden, locked)
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
const titleVco = (text) => ({
  title: [props({ show: bool(true), text: titleText(text) })],
  subTitle: [props({ show: bool(false) })],
  padding: [props({ top: num(8), bottom: num(8), left: num(8), right: num(8) })],
  border: [props({ show: bool(false) })],
  dropShadow: [props({ show: bool(false) })],
  visualHeader: [props({ show: bool(false) })],
});

const sortBy = (field, direction) => ({ sort: [{ field, direction }], isDefaultSort: true });

const millionsLabels = (extra = {}) => ({ show: bool(true), labelDisplayUnits: num(1000000), labelPrecision: int(1), labelPosition: str("OutsideEnd"), ...extra });

// ---------------------------------------------------------------- visual builders
function container(seed, kind, pos, visual, extra = {}) {
  return { name: hex(seed), position: { x: pos.x, y: pos.y, z: pos.z ?? 1000, height: pos.h, width: pos.w, tabOrder: pos.z ?? 1000 }, visual: { visualType: kind, ...visual }, ...extra };
}

function titleBox(seed, text, pos) {
  return container(seed, "textbox", pos, {
    objects: { general: [props({ paragraphs: [{ textRuns: [{ value: text, textStyle: { fontFamily: "Segoe UI Semibold", fontSize: `${T_PAGE}pt`, color: TEXT } }], horizontalTextAlignment: "left" }] })] },
    visualContainerObjects: {
      background: [props({ show: bool(false) })], border: [props({ show: bool(false) })],
      padding: [props({ top: num(0), bottom: num(0), left: num(0), right: num(0) })],
    },
  });
}

function pageNav(seed, pos) {
  return container(seed, "pageNavigator", pos, {
    objects: {
      pages: [props({ showHiddenPages: bool(false), showTooltipPages: bool(false) })],
      layout: [props({ cellPadding: int(8) })],
      fill: [props({ show: bool(true), fillColor: color("#F3F2F1"), transparency: num(0) }, { id: "default" }), props({ show: bool(true), fillColor: color(AC), transparency: num(0) }, { id: "selected" })],
      text: [props({ fontFamily: str("Segoe UI"), fontSize: num(12), fontColor: color(TEXT) }, { id: "default" }), props({ fontColor: color("#FFFFFF"), bold: bool(true) }, { id: "selected" })],
      outline: [props({ show: bool(false) }, { id: "default" }), props({ show: bool(false) }, { id: "selected" })],
    },
    visualContainerObjects: { padding: [props({ top: num(0), bottom: num(0), left: num(0), right: num(0) })], border: [props({ show: bool(false) })] },
  });
}

// Header controls share one style: a 12pt label above, a 48px control below, no slicer header
function dropdown(seed, table, column, group, pos) {
  return container(seed, "slicer", pos, {
    syncGroup: { groupName: group, fieldChanges: true, filterChanges: true },
    query: { queryState: { Values: { projections: [cProj(table, column)] } } },
    objects: {
      data: [props({ mode: str("Dropdown") })],
      header: [props({ show: bool(false) })],
      items: [props({ textSize: num(T_LABEL), fontColor: color(TEXT) })],
    },
    visualContainerObjects: {
      title: [props({ show: bool(false) })],
      padding: [props({ top: num(8), bottom: num(8), left: num(0), right: num(0) })],
      border: [props({ show: bool(false) })],
    },
  });
}

// Button slicer: light grey tiles, the selected tile dark grey with white text
function buttonSlicer(seed, table, column, group, tiles, pos, opts = {}) {
  const state = (dflt, sel) => [props(dflt, { id: "default" }), props(sel, { id: "selected" })];
  return container(seed, "advancedSlicerVisual", pos, {
    syncGroup: { groupName: group, fieldChanges: true, filterChanges: true },
    query: { queryState: { Values: { projections: [cProj(table, column)] } } },
    objects: {
      layout: [props({ rowCount: int(1), columnCount: int(tiles), cellPadding: int(8) })],
      selection: [props({ singleSelect: bool(true), strictSingleSelect: bool(!!opts.force), selectAllCheckboxEnabled: bool(!!opts.selectAll) })],
      value: state({ fontFamily: str("Segoe UI"), fontSize: num(T_LABEL), fontColor: color(TEXT), horizontalAlignment: str("center") }, { fontColor: color("#FFFFFF"), bold: bool(true) }),
      background: state({ show: bool(true), color: color("#F3F2F1"), transparency: num(0) }, { show: bool(true), color: color(AC), transparency: num(0) }),
      outline: state({ show: bool(false) }, { show: bool(false) }),
      label: [props({ show: bool(false) }, { id: "default" })],
      selectionIcon: state({ show: bool(false) }, { show: bool(false) }),
    },
    visualContainerObjects: {
      title: [props({ show: bool(false) })],
      padding: [props({ top: num(0), bottom: num(0), left: num(0), right: num(0) })],
      background: [props({ show: bool(false) })],
      border: [props({ show: bool(false) })],
    },
  });
}

// One KPI card per measure, so $ values can show in $M while % values stay %; variances are red/green by sign.
// The card title comes from the container, so the comparison cards can follow the Compare with slicer.
const KPI_ACCENT = { AC, PY, BU: AC, FC: "#8C8C8C" };
function kpiCard(seed, m, title, pos) {
  const isVariance = m.startsWith("Δ");
  const isPct = m.endsWith("%");
  const sign = isVariance ? signColor(m) : null;
  return container(seed, "cardVisual", pos, {
    query: { queryState: { Data: { projections: [mProj(m)] } } },
    objects: {
      value: [props({ labelDisplayUnits: str(isPct ? "1" : "1000000"), labelPrecision: int(1), fontColor: sign ?? color(TEXT) }, { id: "default" })],
      label: [props({ show: bool(false) }, { id: "default" })],
      padding: [props({ paddingUniform: int(8) }, { id: "default" })],
      layout: [props({ paddingUniform: int(0) }, { id: "default" })],
      outline: [props({ show: bool(false) }, { id: "default" })],
      accentBar: [props({ show: bool(true), color: sign ?? color(KPI_ACCENT[m]), width: num(4), position: str("Left") }, { id: "default" })],
    },
    visualContainerObjects: {
      // Card labels are container titles: the theme sizes those as visual titles (14pt), card labels are 12pt
      title: [props({ show: bool(true), text: titleText(title), fontFamily: str("Segoe UI"), fontSize: num(T_LABEL), fontColor: color(TEXT2) })],
      subTitle: [props({ show: bool(false) })],
      padding: [props({ top: num(8), bottom: num(8), left: num(8), right: num(8) }, { id: "default" })],
      background: [props({ show: bool(true), color: color("#FAFAFA"), transparency: num(0) })],
      border: [props({ show: bool(false) })],
      visualHeader: [props({ show: bool(false) })],
    },
  }, { filterConfig: yearFilter(seed) });
}

// KPI strip: AC PY BU FC | Δ Δ % vs the selected comparison; cards 8px apart in a group, 16px between groups
function kpiStrip(pageKey, y) {
  const groups = [
    [["AC", "AC (actual)"], ["PY", "PY (last year)"], ["BU", "BU (budget)"], ["FC", "FC (forecast)"]],
    [["ΔCMP", { measure: "Title KPI Δ" }], ["ΔCMP %", { measure: "Title KPI Δ %" }]],
  ];
  const w = 300, h = 104;
  const cards = [];
  let x = M, z = 1000;
  for (const g of groups) {
    for (const [m, t] of g) { cards.push(kpiCard(`${pageKey}/kpi/${m}`, m, t, { x, y, w, h, z })); x += w + 8; z += 10; }
    x += 8;
  }
  return cards;
}

// SVG chart drawn by a DAX measure (dataCategory ImageUrl), shown 1:1 in a standard image visual
function svgImage(seed, m, alt, pos) {
  return container(seed, "image", pos, {
    objects: {
      image: [props({ sourceType: str("imageData"), sourceField: { expr: measureExpr(m) }, fit: str("Fit"), altText: str(alt) })],
    },
    visualContainerObjects: {
      title: [props({ show: bool(false) })],
      padding: [props({ top: num(0), bottom: num(0), left: num(0), right: num(0) })],
      background: [props({ show: bool(true), color: color("#FFFFFF"), transparency: num(0) })],
      border: [props({ show: bool(false) })],
      dropShadow: [props({ show: bool(false) })],
      visualHeader: [props({ show: bool(false) })],
    },
    drillFilterOtherVisuals: true,
  });
}

function label(seed, text, pos) {
  return container(seed, "textbox", pos, {
    objects: { general: [props({ paragraphs: [{ textRuns: [{ value: text, textStyle: { fontFamily: "Segoe UI Semibold", fontSize: `${T_LABEL}pt`, color: TEXT2 } }], horizontalTextAlignment: "left" }] })] },
    visualContainerObjects: {
      background: [props({ show: bool(false) })], border: [props({ show: bool(false) })],
      padding: [props({ top: num(0), bottom: num(0), left: num(0), right: num(0) })],
    },
  });
}

// Scenario columns/bars: per-measure IBCS notation
const scenarioDataPoint = (measures) => measures.map((m) => {
  const s = { metadata: `Sales.${m}` };
  if (m === "AC") return props({ fill: color(AC), borderShow: bool(false) }, s);
  if (m === "PY") return props({ fill: color(PY), borderShow: bool(false) }, s);
  if (m === "BU") return props({ fill: color(BU_FILL), borderShow: bool(true), borderColor: color(AC), borderSize: num(1.5) }, s);
  return props({ fill: color(AC), fillTransparency: num(60), borderShow: bool(true), borderColor: color(AC), borderSize: num(1.5) }, s); // FC: tinted AC with outline, standing in for IBCS hatching
});

// Responsive charts shrink their text when the visual is small; keep the theme's font sizes instead
const FIXED_TEXT = [props({ responsive: bool(false) })];

function scenarioChart(seed, kind, category, measures, title, pos, opts = {}) {
  const queryState = { Category: { projections: [category] }, Y: { projections: measures.map((m) => mProj(m)) } };
  if (opts.rows) queryState.Rows = { projections: [opts.rows] };
  // AC labels only, in whole $M so they stay short next to the PY/BU bars (a label background colour fails PBIR validation)
  const labels = [props({ show: bool(true), labelDisplayUnits: num(1000000), labelPrecision: int(0), labelPosition: str("OutsideEnd") })];
  for (const m of measures) if (m !== "AC") labels.push(props({ show: bool(false) }, { metadata: `Sales.${m}` }));
  const objects = {
    dataPoint: scenarioDataPoint(measures),
    labels,
    legend: [props({ show: bool(true), position: str("Top") })],
    categoryAxis: [props({ show: bool(true), showAxisTitle: bool(false), gridlineShow: bool(false) })],
    valueAxis: [props({ show: bool(false), gridlineShow: bool(false), showAxisTitle: bool(false), start: num(0) })],
    layout: [props({ clusteredGapSize: num(opts.gap ?? 0) })],
    general: FIXED_TEXT,
  };
  if (opts.rows) objects.smallMultiplesLayout = [props({ layoutType: str("custom"), rowCount: int(1), columnCount: int(2) })];
  return container(seed, kind, pos, {
    query: { queryState, sortDefinition: opts.sort },
    objects,
    visualContainerObjects: titleVco(title),
  }, { filterConfig: yearFilter(seed) });
}

function varianceChart(seed, kind, category, m, title, pos, opts = {}) {
  const queryState = { Category: { projections: [category] }, Y: { projections: [mProj(m)] } };
  if (opts.rows) queryState.Rows = { projections: [opts.rows] };
  const pct = m.endsWith("%");
  const objects = {
    dataPoint: [props({ fill: signColor(m) }, { data: [{ dataViewWildcard: { matchingOption: 1 } }] })],
    labels: [props(pct ? { show: bool(true), labelPrecision: int(1), labelPosition: str("OutsideEnd") } : millionsLabels())],
    legend: [props({ show: bool(false) })],
    categoryAxis: [props({ show: bool(true), showAxisTitle: bool(false), gridlineShow: bool(false) })],
    valueAxis: [props({ show: bool(false), gridlineShow: bool(false), showAxisTitle: bool(false) })],
    general: FIXED_TEXT,
  };
  if (opts.rows) objects.smallMultiplesLayout = [props({ layoutType: str("custom"), rowCount: int(1), columnCount: int(2) })];
  return container(seed, kind, pos, {
    query: { queryState, sortDefinition: opts.sort ?? sortBy(measureExpr(m), "Ascending") },
    objects,
    visualContainerObjects: titleVco(title),
  }, { filterConfig: yearFilter(seed) });
}

function waterfall(seed, category, m, title, pos) {
  return container(seed, "waterfallChart", pos, {
    query: { queryState: { Category: { projections: [category] }, Y: { projections: [mProj(m)] } }, sortDefinition: sortBy(measureExpr(m), "Ascending") },
    objects: {
      sentimentColors: [props({ increaseFill: color(GOOD), decreaseFill: color(BAD), totalFill: color(AC) })],
      labels: [props(millionsLabels())],
      legend: [props({ show: bool(false) })],
      categoryAxis: [props({ show: bool(true), showAxisTitle: bool(false) })],
      valueAxis: [props({ show: bool(false), showAxisTitle: bool(false) })],
      general: FIXED_TEXT,
    },
    visualContainerObjects: titleVco(title),
  }, { filterConfig: yearFilter(seed) });
}

// Table/matrix colour helpers
const tableValueColors = (measures) => measures.map((m) => props({ fontColor: signColor(m) }, { data: [{ dataViewWildcard: { matchingOption: 1 } }], metadata: `Sales.${m}` }));
const tableChrome = (rowPadding = 6) => ({
  columnHeaders: [props({ bold: bool(true), backColor: color("#FFFFFF"), autoSizeColumnWidth: bool(true), columnAdjustment: str("growToFit") })],
  grid: [props({ gridHorizontal: bool(true), gridHorizontalColor: color(LINE), gridVertical: bool(false), rowPadding: num(rowPadding) })],
  total: [props({ fontColor: color(TEXT), bold: bool(true), backColor: color("#F3F2F1") })],
});

function table(seed, projections, varianceMeasures, title, pos, opts = {}) {
  const chrome = tableChrome(opts.rowPadding);
  if (opts.image) chrome.grid[0].properties = { ...chrome.grid[0].properties, imageHeight: num(opts.image.h), imageWidth: num(opts.image.w) };
  return container(seed, "tableEx", pos, {
    query: { queryState: { Values: { projections } }, sortDefinition: opts.sort },
    objects: {
      ...chrome,
      values: [props({ backColorPrimary: color("#FFFFFF"), backColorSecondary: color("#FFFFFF"), fontColorPrimary: color(TEXT), fontColorSecondary: color(TEXT) }), ...tableValueColors(varianceMeasures)],
    },
    visualContainerObjects: { ...titleVco(title), stylePreset: [props({ name: str("None") })] },
  }, { filterConfig: yearFilter(seed) });
}

function matrix(seed, rows, columns, measures, varianceMeasures, title, pos, sort) {
  return container(seed, "pivotTable", pos, {
    query: { queryState: { Rows: { projections: [rows] }, Columns: { projections: [columns] }, Values: { projections: measures.map((m) => mProj(m)) } }, sortDefinition: sort },
    objects: {
      ...tableChrome(5),
      values: [props({ backColorPrimary: color("#FFFFFF"), backColorSecondary: color("#FFFFFF"), fontColorPrimary: color(TEXT), fontColorSecondary: color(TEXT) }), ...tableValueColors(varianceMeasures)],
    },
    visualContainerObjects: { ...titleVco(title), stylePreset: [props({ name: str("None") })] },
  }, { filterConfig: yearFilter(seed) });
}

// ---------------------------------------------------------------- pages
const month = cProj("Date", "Year Month");
const monthShort = cProj("Date", "Month");
const channel = cProj("Store", "Channel");
const country = cProj("Store", "Country");
const category = cProj("Product", "Category");
const monthSort = sortBy(columnExpr("Date", "Year Month"), "Ascending");
const monthShortSort = sortBy(columnExpr("Date", "Month"), "Ascending");
const CONTENT_Y = 168;

function header(pageKey, title) {
  const ctrl = { y: 96, h: 48 }, lbl = { y: 72, h: 24 };
  const compare = { x: 1096, w: 216 }, chan = { x: 1336, w: 312 }, ctry = { x: 1672, w: 216 };
  return [
    titleBox(`${pageKey}/title`, title, { x: M, y: 20, w: W - 2 * M, h: 44, z: 100 }),
    pageNav(`${pageKey}/nav`, { x: M, y: ctrl.y, w: 480, h: ctrl.h, z: 200 }),
    label(`${pageKey}/compare_label`, "Compare with", { x: compare.x, ...lbl, w: compare.w, z: 300 }),
    buttonSlicer(`${pageKey}/compare_btn`, "Comparison", "Comparison", "ComparisonSync", 3, { x: compare.x, ...ctrl, w: compare.w, z: 310 }, { force: true }),
    label(`${pageKey}/channel_label`, "Channel", { x: chan.x, ...lbl, w: chan.w, z: 400 }),
    buttonSlicer(`${pageKey}/channel_btn`, "Store", "Channel", "ChannelSync", 3, { x: chan.x, ...ctrl, w: chan.w, z: 410 }, { selectAll: true }),
    label(`${pageKey}/country_label`, "Country", { x: ctry.x, ...lbl, w: ctry.w, z: 500 }),
    dropdown(`${pageKey}/country_dd`, "Store", "Country", "CountrySync", { x: ctry.x, ...ctrl, w: ctry.w, z: 510 }),
  ];
}

const pages = [
  {
    key: "overview",
    displayName: "Overview",
    title: "2025 sales of $299.9M: 8% below last year and 14% below budget, but 2% ahead of the latest forecast",
    visuals: (k) => [
      ...kpiStrip(k, CONTENT_Y),
      svgImage(`${k}/hero`, "Monthly Hero SVG", "Net sales by month 2025: AC vs the selected comparison, with monthly variance", { x: M, y: 296, w: 1240, h: 752, z: 2000 }),
      varianceChart(`${k}/channel_dcmp`, "clusteredBarChart", channel, "ΔCMP", { measure: "Title Δ by channel" }, { x: 1296, y: 296, w: 592, h: 232, z: 4000 }),
      varianceChart(`${k}/country_dcmp`, "clusteredBarChart", country, "ΔCMP", { measure: "Title Δ by country" }, { x: 1296, y: 552, w: 592, h: 496, z: 5000 }),
    ],
  },
  {
    key: "channel",
    displayName: "Channel",
    title: "Online lost $31.6M vs last year (−16%) and missed budget by 22%; physical stores grew 5%",
    visuals: (k) => [
      svgImage(`${k}/hero`, "Channel Hero SVG", "Online vs Stores 2025: PY, AC, BU and FC bars, with variance vs the selected comparison", { x: M, y: CONTENT_Y, w: 1144, h: 512, z: 1000 }),
      waterfall(`${k}/bridge_cmp`, channel, "ΔCMP", { measure: "Title channel bridge" }, { x: 1200, y: CONTENT_Y, w: 688, h: 512, z: 2000 }),
      varianceChart(`${k}/monthly_dcmp_pct`, "clusteredColumnChart", monthShort, "ΔCMP %", { measure: "Title Δ % by month and channel" }, { x: M, y: 704, w: 880, h: 344, z: 3000 }, { sort: monthShortSort, rows: channel }),
      table(`${k}/scorecard_all`, [
        channel, mProj("AC"), mProj("PY"), mProj("BU"), mProj("FC"), mProj("ΔPY %"), mProj("ΔBU %"), mProj("ΔFC %"),
      ], ["ΔPY %", "ΔBU %", "ΔFC %"], "Channel scorecard", { x: 936, y: 704, w: 952, h: 344, z: 4000 }, { rowPadding: 8, sort: sortBy(measureExpr("AC"), "Descending") }),
    ],
  },
  {
    key: "country",
    displayName: "Country",
    title: "Online and US stores account for the whole decline; every other country grew 7–30% on last year",
    visuals: (k) => [
      varianceChart(`${k}/dcmp`, "clusteredBarChart", country, "ΔCMP", { measure: "Title Δ by country" }, { x: M, y: CONTENT_Y, w: 597, h: 448, z: 1000 }),
      varianceChart(`${k}/dcmp_pct`, "clusteredBarChart", country, "ΔCMP %", { measure: "Title Δ % by country" }, { x: 653, y: CONTENT_Y, w: 597, h: 448, z: 2000 }),
      scenarioChart(`${k}/scenarios`, "clusteredBarChart", country, ["PY", "AC", "BU"], "Net sales by country, $M: AC vs PY and BU", { x: 1274, y: CONTENT_Y, w: 614, h: 448, z: 3000 }, { sort: sortBy(measureExpr("AC"), "Descending"), gap: 25 }),
      table(`${k}/scorecard`, [
        country, channel,
        mProj("AC"), mProj("PY"), mProj("ΔPY"), mProj("ΔPY %"), mProj("BU"), mProj("ΔBU"), mProj("ΔBU %"), mProj("FC"), mProj("ΔFC %"),
      ], ["ΔPY", "ΔPY %", "ΔBU", "ΔBU %", "ΔFC %"], "Country scorecard", { x: M, y: 640, w: 1856, h: 408, z: 4000 }, { rowPadding: 4, sort: sortBy(measureExpr("ΔPY"), "Ascending") }),
    ],
  },
  {
    key: "category",
    displayName: "Category",
    title: "TV and Video fell 36% on last year in both channels; Cameras and Audio grew",
    visuals: (k) => [
      varianceChart(`${k}/dcmp`, "clusteredBarChart", category, "ΔCMP", { measure: "Title Δ by category" }, { x: M, y: CONTENT_Y, w: 916, h: 384, z: 1000 }),
      varianceChart(`${k}/dcmp_pct`, "clusteredBarChart", category, "ΔCMP %", { measure: "Title Δ % by category" }, { x: 972, y: CONTENT_Y, w: 916, h: 384, z: 2000 }),
      matrix(`${k}/matrix_cmp`, category, channel, ["AC", "ΔCMP %"], ["ΔCMP %"], { measure: "Title category matrix" }, { x: M, y: 576, w: 916, h: 472, z: 3000 }, sortBy(measureExpr("AC"), "Descending")),
      scenarioChart(`${k}/scenarios`, "clusteredBarChart", category, ["PY", "AC", "BU"], "Net sales by category, $M: AC vs PY and BU", { x: 972, y: 576, w: 916, h: 472, z: 4000 }, { sort: sortBy(measureExpr("AC"), "Descending"), gap: 25 }),
    ],
  },
];

// ---------------------------------------------------------------- theme
function buildTheme() {
  const theme = {
    name: "ContosoIBCS",
    dataColors: [AC, PY, "#7F7F7F", "#A6A6A6", GOOD, BAD, "#D9D9D9", "#000000"],
    good: GOOD, neutral: "#A6A6A6", bad: BAD,
    maximum: AC, center: "#A6A6A6", minimum: "#F2F2F2", null: "#D9D9D9",
    background: "#FFFFFF", foreground: TEXT, tableAccent: AC,
    firstLevelElements: TEXT, secondLevelElements: TEXT2,
    // Type scale: visual titles 14pt semibold, axes/legends/tables 12pt, data labels 11pt, KPI values 26pt.
    // Page titles (24pt) are text boxes, which do not read text classes.
    textClasses: {
      callout: { fontSize: T_KPI, fontFace: "Segoe UI Semibold", color: TEXT },
      title: { fontSize: T_LABEL, fontFace: "Segoe UI Semibold", color: TEXT },
      largeTitle: { fontSize: T_TITLE, fontFace: "Segoe UI Semibold", color: TEXT },
      header: { fontSize: T_LABEL, fontFace: "Segoe UI Semibold", color: TEXT },
      label: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT },
      semiboldLabel: { fontSize: T_LABEL, fontFace: "Segoe UI Semibold", color: TEXT },
      largeLabel: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT },
      boldLabel: { fontSize: T_LABEL, fontFace: "Segoe UI Bold", color: TEXT },
      lightLabel: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT2 },
      largeLightLabel: { fontSize: T_LABEL, fontFace: "Segoe UI", color: TEXT2 },
      smallLabel: { fontSize: T_DATA, fontFace: "Segoe UI", color: TEXT },
      smallLightLabel: { fontSize: T_DATA, fontFace: "Segoe UI", color: TEXT },
    },
    visualStyles: {
      "*": {
        "*": {
          border: [{ show: false }],
          dropShadow: [{ show: false }],
          padding: [{ top: 8, bottom: 8, left: 8, right: 8 }],
          visualHeader: [{ show: false }],
          categoryAxis: [{ gridlineShow: false }],
          valueAxis: [{ gridlineShow: false }],
        },
      },
      page: { "*": { background: [{ color: { solid: { color: "#FFFFFF" } }, transparency: 0 }], outspace: [{ color: { solid: { color: "#FFFFFF" } } }] } },
      slicer: {
        "*": {
          header: [{ fontFamily: "Segoe UI Semibold", textSize: T_LABEL, fontColor: { solid: { color: TEXT } }, outlineStyle: 0 }],
          items: [{ fontFamily: "Segoe UI", textSize: T_LABEL, fontColor: { solid: { color: TEXT } }, outlineStyle: 0, padding: 2 }],
        },
      },
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

const pagesDir = path.join(DEF, "pages");
fs.rmSync(pagesDir, { recursive: true, force: true });

const pageIds = [];
for (const p of pages) {
  const id = hex(`page/${p.key}`);
  pageIds.push(id);
  const visuals = [...header(p.key, p.title), ...p.visuals(p.key)].map((v) => ({ $schema: VISUAL_SCHEMA, ...v }));
  // Every data visual cross-filters every other data visual on the page (Filter, not Highlight)
  const data = visuals.filter((v) => !["textbox", "pageNavigator", "slicer", "advancedSlicerVisual"].includes(v.visual.visualType));
  const interactions = [];
  for (const s of data) for (const t of data) if (s !== t && s.visual.visualType !== "image") interactions.push({ source: s.name, target: t.name, type: "DataFilter" });
  writeJson(path.join(pagesDir, id, "page.json"), {
    $schema: PAGE_SCHEMA, name: id, displayName: p.displayName, displayOption: "FitToPage", height: H, width: W,
    objects: { background: [props({ color: color("#FFFFFF"), transparency: num(0) })] },
    visualInteractions: interactions,
  });
  for (const v of visuals) writeJson(path.join(pagesDir, id, "visuals", v.name, "visual.json"), v);
}
writeJson(path.join(pagesDir, "pages.json"), {
  $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json",
  pageOrder: pageIds, activePageName: pageIds[0],
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
report.resourcePackages.push({ name: "RegisteredResources", type: "RegisteredResources", items: [{ name: theme.file, path: theme.file, type: "CustomTheme" }] });
writeJson(reportFile, report);

console.log(`Wrote ${pages.length} pages, theme ${theme.file}`);
