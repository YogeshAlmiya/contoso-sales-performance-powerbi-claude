# Reference design spec (from Ilya Fedorkov's video walkthrough)

Source: the author's 11-minute video, read frame by frame. Frames are in `_brief/reference/ref_XX_tNNN.png` (NNN = second in the video).
His data: EUR, year to date 19 Oct 2026, FC 9+3. **Ours: USD, full year 2025 (closed), FC 6+6.** Copy the design, not his numbers.

## 1. How he got there (the process matters more than the prompt)
- His report prompt was short and outcome-based: who it's for (leadership), what they need to see (this year vs PY, BU, FC and what drives the gaps), IBCS notation, "a clean overview page plus a few pages that explain the drivers, with titles that state the insight", plan first, then **"preview every page, review the screenshots and keep polishing until it looks professional."**
- Claude's plan had three parts before any build (ref_01–03): **"The story in the data"** (5 bullets + a small driver table), a **page plan table** (page | dynamic headline | contents), and **"Design direction"** + **"Decisions to confirm"**.
- Build took ~75 min, polish another ~90 min, on **Opus 5.5 Extra high** effort. The **render → screenshot → look → fix loop** is, in his words, "why it looks professional".
- Claude saved the as-built spec to `_brief/report-spec.md`.

## 2. Design direction (his Claude's words, ref_03)
- Calm "boardroom" style: white panels on a light grey canvas, no shadows, no decoration.
- IBCS everywhere: AC solid charcoal, PY solid grey, BU white with charcoal outline, FC charcoal hatching. Variances green/red bars with a signed label (+1.2 / −3.4 / +0.8 pp).
- Chart titles in IBCS pipe form: `Sales | EUR m | AC/FC vs BU | 2026 by month`.
- Type: Segoe UI throughout, **22 pt headline**, **12 pt chart titles**, amounts in millions to one decimal.
- Slicers: none on the Overview; at most a Region and a Channel dropdown (top right) on driver pages.

## 3. Shell (every page) — ref_04, ref_14
- **Left sidebar, dark navy, full height (~185 px of 1280):** small caps "CONTOSO ELECTRONICS" + bold "Sales Performance"; page buttons (Overview, Channels, Products, Regions, Margin, Outlook) with a lighter-navy active state. He used **buttons, not the page navigator** (the navigator didn't render in the service).
- **"COMPARE WITH" switch in the sidebar:** three square buttons PY | BU | FC; selected = white with dark text, others navy. Defaults to **BU**, keeps its value across pages. Built as items in the existing Scenario calc group (one generic set of comparison items), not duplicated measures.
- **IBCS notation legend at bottom left:** AC Actual (solid), FC Forecast (hatched), BU Budget (outlined), PY Previous year (grey), Δ Variance +/− (green/red).
- **Header:** dynamic headline measure (~22 pt, regular weight, near-black), then a grey subtitle: `Year to date to 19 Oct 2026 · EUR excl. VAT · AC actual, PY previous year, BU Budget 2026, FC Forecast 9+3 2026 · <active region>`.
- Headlines rewrite on filter/click (e.g. picking France → "Store accounts for 67% of the €1.3M gap to budget and is 17.6% below last year"), and on the Compare-with switch.

## 4. Pages and visuals
**Overview** (ref_04–06): headline "Sales are 10.3% below budget and 7.1% below last year; the forecast closes 2026 7.8% short of budget".
- 4 KPI tiles as **SVG images**: label (`Sales · AC year to date · EUR m`), big value (~28 pt bold), two rows `ΔBU −10.7 −10.3%` / `ΔPY −7.0 −7.1%` in red/green, and on the right three mini horizontal bars labelled AC (solid), BU (outline), PY (grey); FC tile uses a hatched bar. Tiles: Sales, Margin, Margin %, Sales FC full year. Margin % shows Δ in pp.
- Hero SVG `Sales | EUR m | AC and FC vs BU and PY | by month`: per month PY grey bar offset left and behind, AC black in front, BU outlined bar offset right, FC hatched (a month partly actual shows black bottom + hatched top). Value label above each group (one decimal). Legend row at top (■ AC ▨ FC □ BU ■ PY). **Variance strip below** labelled `ΔBU` on the left, red/green bars from a zero line, hatched red/green for forecast months, labels at bar ends.
- Right column: `Sales | EUR m | ΔBU year to date | by channel` and `... | by product category` — horizontal variance bars, sorted by variance, signed labels (−9.0M) next to the bar, thin zero axis.

**Channels** (ref_07–08): headline "B2B accounts for 84% of the €10.7M gap to budget and is 36.4% below last year".
- `AC, PY, BU year to date | by channel`: grouped horizontal bars — AC black, PY grey, BU outline, label on AC.
- Two variance charts side by side: ΔPY by channel and ΔBU by channel.
- Below: the monthly IBCS chart for the selected/biggest-gap channel ("B2B sales | ...") and ΔBU by product category for that channel.

**Products** (ref_09, his screenshot 8): headline "€7.4M of the €10.7M gap to budget comes from Laptops, where units are 35.9% below plan".
- AC vs BU by category (black bar, outline behind), ΔBU by category, ΔBU % by category.
- **Driver table** `Product categories | where the gap to budget comes from | year to date`: Category, Sales AC, ΔBU, ΔBU %, Units ΔBU %, Avg. price ΔBU %, Unit cost ΔBU %, Discount rate ΔBU (pp). Red/green text, light row striping, vertical divider after Category, bold Total row.

**Regions** (ref_10): AC vs BU by region, ΔBU by region, a **region × channel ΔBU matrix** (red/green text), ΔBU by country.

**Margin** (ref_11): headline "Margin is 1.4 pp below budget: unit costs ran €5.3M above plan, higher prices recovered €4.1M".
- **Margin bridge (waterfall) BU → AC**: BU (outlined) → Volume → List price → Discount → Unit cost → AC (black). Red/green steps.
- Margin rate | pp | ΔBU by product category; Margin rate | % | AC, PY, BU by month (line chart).

**Outlook** (ref_12, ref_13): headline "The forecast closes 2026 €10.9M below budget and needs Oct–Dec to run 2.8% above last year after Aug–Oct ran 16.7% below".
- Monthly AC and FC vs PY: Jan–Sep black, Oct black+hatched, Nov–Dec hatched; PY grey behind.
- `Sales | ΔPY % | recent actuals vs forecast months` (two bars: Actual Aug–Oct vs PY, Forecast Oct–Dec vs PY).
- `FC ΔBU full year | by channel` and `| by product category` — **hatched red/green variance bars** (SVG).

**Tooltip page** (ref_15): hovering a category/region/row shows the item name, `AC €3.9M ΔBU +€0.5M (+14.8%) year to date`, and a small monthly IBCS chart vs the chosen comparison with a Δ strip.

## 5. SVG technique (ref_12–13)
`Chart = "data:image/svg+xml;utf8," & "<svg>…</svg>"` built with `VAR bars = CONCATENATEX(...)`, `VAR hatch = "<pattern …>"` (diagonal lines, `fill="url(#h)"`), `VAR labels = …`. Shown in a standard **Image** visual, Image source = "Select from data" → the measure, Image fit = Fit. No custom visuals.

## 6. His polish-round lessons (ref_14, Claude's notes)
- SVG images follow filters and clicks elsewhere but **can't be clicked** themselves.
- Variance-by-channel/category bars were turned back into **native charts so they can be clicked**, using lighter red/green for forecast variance instead of hatching.
- A channel chart fixed to one channel left a blank when another was clicked → now shows the clicked channel, default = biggest gap.
- Bugs he hit: the switch made the margin bridge take 46 s (fixed to ~1 s); a comparison bar wiped Nov–Dec forecast elsewhere; unused scenarios leaked into legends; labels showing "−0.0M".

## 7. Mapping to our project
| His | Ours |
|---|---|
| EUR m, YTD 19 Oct 2026 | USD m, full year 2025 |
| Channels B2B / Store / Online | Online / Stores |
| Regions (DACH, Benelux…) | Countries (US, CA, DE, AU, GB, NL, FR, IT, Online) |
| FC 9+3 | FC 6+6 (Jan–Jun actuals, Jul–Dec forecast) |
| Price/volume vs BU | Plan has no units/cost → price/volume/unit-cost **vs PY**; ΔBU only on sales |
| Margin bridge BU → AC | Margin bridge **PY → AC** (volume, price, unit cost) |
| Outlook: remaining months | Outlook: "what the June forecast expected vs what happened" (H2 FC hatched vs H2 AC) |
