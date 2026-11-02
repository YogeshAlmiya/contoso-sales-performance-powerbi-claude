# Report spec: IBCS redesign (as built)

Replaces the previous 4-page spec (see git history). Design copied from `_brief/reference-design-spec.md` and the frames in `_brief/reference/`; numbers are ours: USD, full year 2025 (closed), FC 6+6. Approved as proposed; built by `tools/build_report.mjs`. Final screenshots: `_brief/screenshots/`.

**Where the build differs from the proposal**
- Level charts on Channels, Products and Regions show fixed AC, PY, BU bars (no FC, no "AC vs selected comparison"): native charts can't restyle a series when the switch changes, and a native FC bar can't be hatched. The variance charts beside them follow Compare with.
- Headline and subtitle are the title and subtitle of one card: card values cut long text with "…", container titles wrap.
- Products and Regions row 1 is 640 / 444 / 444 so long category names fit.
- Compare with: the selected button renders with Desktop's own dark fill; Desktop ignores the "selected" state styling in PBIR and in the theme.
- `Gross Margin % ΔPY pp` returns 0 when the change rounds to 0.0 pp, so labels never read −0.0 pp. The margin bridge effects divide as double and round to the cent.
- Final review round:
  - The Filters pane is hidden for readers and collapsed (the hidden, locked Year = 2025 page filters stay).
  - The Regions matrix uses red/green text only; values that show as $0.0M are grey.
  - Number headers are right-aligned, and the sort arrows stay so the order follows Compare with.
  - The margin rate chart has a labelled y-axis and labels only the December points (measures `Gross Margin % Last Month` and `Gross Margin % PY Last Month`).
  - Outlook ΔFC bars use the lighter forecast shades.
- The tooltip page has page type Tooltip ("Allow use as tooltip"), which `tools/validate_pbip.py` now checks along with the tooltip wiring of every native chart, table and matrix.
- Screenshots: `_brief/screenshots/` with Compare with on BU (the default), and `_brief/screenshots/fc/` with FC.

## 1. Story in the data (2025, USD)

| | AC | PY | BU | FC 6+6 |
|---|---|---|---|---|
| Sales $M | 299.9 | 325.0 | 349.5 | 292.8 |
| AC vs | | −25.1 (−7.7%) | −49.6 (−14.2%) | +7.2 (+2.4%) |

- **Overall:** 14.2% below budget, 7.7% below last year. The June forecast expected 292.8 and the year beat it by 7.2.
- **Online is 94% of the gap** (−46.5 vs BU, −21.9%; −16.0% vs PY, units −10.5%). Stores are close to budget (−3.1, −2.2%) and +5.1% on PY.
- **Countries:** Online and the United States are −57.5 vs BU. The other 7 are +7.9 net (Germany +3.7, Canada +2.1).
- **Categories:** Computers −18.4, TV and Video −16.7 (units −37.5% vs PY), Home Appliances −13.1. Cameras +5.1 and Audio +1.5 are ahead.
- **Shape of the year:** H1 −15.7% vs PY; H2 +0.9%. December is the only month above budget (+0.5).
- **Margin** 168.1, −13.6 vs PY. The rate is 56.0% (+0.1 pp). List prices and unit costs per product are identical in 2024 and 2025, so the drop is volume and mix:

| Driver (PY → AC) | Effect $M |
|---|---|
| Volume (units −1.1%) | −2.0 |
| Product mix | −11.7 |
| Price and discount | +0.1 |
| Unit cost | 0.0 |

## 2. Shell (every page, 1920 × 1080)

- **Sidebar:** x0 w280, full height, navy `#0B1530`.
  - **Brand:** "CONTOSO ELECTRONICS" (9 pt caps, `#9AA6C4`) and "Sales Performance" (16 pt semibold, white) at y32.
  - **Page buttons:** six buttons (x16 w248 h44, from y128, step 52) using a page-navigation action. The current page uses `#1F2D52` with a white 3 px left bar and bold white text; the others use `#C9D1E3` text on navy.
  - **Compare with:** a "COMPARE WITH" label at y480. Below it, at y508 h64, a button slicer PY | BU | FC with three square cells. Unselected: `#1F2D52` with white text. Selected: white with navy text. Sync group `ComparisonSync`; the saved selection is BU on every page.
  - **IBCS legend:** an SVG image at y880 h176. It shows AC Actual (solid), FC Forecast (hatched), BU Budget (outlined), PY Previous year (grey), and Δ Variance +/− (green/red).
- **Canvas:** `#F3F4F6`. Panels are white with radius 8, no border and no shadow.
- **Header:**
  - Headline: x312 y20 w1136 h68, Segoe UI 22 pt regular, `#1A1A1A`, wraps to 2 lines.
  - Channel and Country dropdowns: top right at x1472 and x1692 (w196, y24, h52), with a small grey header and an 11 pt value. Sync groups `ChannelSync` and `CountrySync`.
  - Subtitle: x312 y92 w1576 h24, 10 pt `#6B7280`. Text: `Full year 2025 · USD · AC actual, PY 2024, BU Budget 2025, FC Forecast 6+6 · <filters or "All channels and countries">`.
- **Grid:** content runs x312–1888 and y132–1056, with 24 px gaps.
- **Type:**
  - Chart titles: 12 pt semibold, IBCS pipe form (`Sales | USD m | ΔBU | by channel`); the scenario part follows Compare with.
  - Axis and data labels: 11 pt.
  - Amounts: $M with one decimal. Variance labels are signed.
- **Colours:** AC `#1F1F1F`, PY `#A6A6A6`, BU white with a `#1F1F1F` outline, FC charcoal hatching (SVG; in native charts it is tinted with an outline). Variance colours: green `#3F8A54` and red `#B83A3A`. Forecast variance uses lighter shades: green `#9CC5A6` and red `#E3A3A3`.

## 3. Pages

**Headline examples:** each one shows the default state (Compare with = BU, no filters). Each headline is a measure that responds to Channel, Country, a click (cross-filter) and Compare with:
- **Gap wording:** "gap to" when the total Δ is negative, "lead over" when it is positive.
- **Top contributor:** the top contributor is the item with the largest Δ in the same direction as the total. A share above 100% is reworded as "more than the whole gap".
- **Second comparison:** PY when BU or FC is selected, and BU when PY is selected.

| Page | Headline (default) | Visuals (grid) |
|---|---|---|
| Overview | Sales are 14.2% below budget and 7.7% below last year; Online carries 94% of the $49.6M gap | 4 SVG KPI tiles at y132 h132 w376: Sales, Margin, Margin %, Sales FC 6+6 full year. SVG hero x312 y288 w1000 h768: `Sales \| USD m \| AC vs BU and PY \| 2025 by month` with a Δ strip. Native ΔCMP by channel x1336 y288 w552 h232. Native ΔCMP by category x1336 y544 w552 h512. |
| Channels | Online accounts for 94% of the $49.6M gap to budget and is 16.0% below last year | Row 1 (y132 h380): native AC, PY, BU, FC by channel (w760); native ΔCMP2 by channel (w384); native ΔCMP by channel (w384). Row 2 (y536 h520): SVG monthly chart for the focus channel (the clicked channel, or the one with the biggest gap) at w1000; native ΔCMP by category for the focus channel at w552. |
| Products | $18.4M of the $49.6M gap to budget comes from Computers, where units are 6.7% below last year | Row 1 (y132 h420): native AC vs CMP by category (w760); ΔCMP (w384); ΔCMP % (w384). Driver table y576 h480: Category, Sales AC, Δ, Δ %, Units ΔPY %, Avg. price ΔPY %, Unit cost ΔPY %, Margin % ΔPY pp, with a bold total row. |
| Regions | Online and the United States are $57.5M below budget; the other 7 are $7.9M ahead | Row 1 (y132 h420): native AC vs CMP by country; ΔCMP by country; ΔCMP % by country. Country × category ΔCMP matrix y576 h480 (red/green text). |
| Margin | Margin is $13.6M below last year: product mix cost $11.7M and volume $2.0M, while prices and unit costs held | SVG bridge PY → Volume → Mix → Price and discount → Unit cost → AC at x312 y132 w1000 h924. Native margin % ΔPY pp by category x1336 y132 w552 h450. Native margin % AC vs PY by month (line) x1336 y606 h450. |
| Outlook | The June forecast expected H2 3.7% below last year; H2 closed 0.9% above, $7.2M better, and the year 14.2% below budget | SVG monthly chart x312 y132 w1000 h924: PY grey behind, AC black, FC hatched for Jul–Dec, with an AC − FC strip. SVG pace chart x1336 y132 w552 h220: ΔPY % for H1 actual, H2 forecast (hatched) and H2 actual. Native ΔFC by channel y376 h220. Native ΔFC by category y620 h436. |
| Tooltip (hidden, 480 × 320) | — | Item name, then a line like `AC $106.0M · ΔBU −$18.4M (−14.8%) · 2025`, then a mini SVG chart of AC vs the comparison by month with a Δ strip. Used by every native variance chart. |

## 4. New and changed measures

- **Analytical (visible, tested against SQL):**
  - `Avg Net Price`, `Avg Unit Cost`.
  - `Units ΔPY %`, `Avg Net Price ΔPY %`, `Avg Unit Cost ΔPY %`.
  - `Gross Margin % ΔPY pp`.
  - `Margin Volume Effect`, `Margin Mix Effect`, `Margin Price Effect`, `Margin Unit Cost Effect`. These are computed at product grain with PY unit margins, and the four sum to ΔPY gross margin.
- **Comparison:**
  - `CMP2 Label`, `CMP2`, `ΔCMP2`, `ΔCMP2 %`: the second comparison.
  - `Focus Channel`, `ΔCMP Focus Channel`.
  - `Comparison Label` now defaults to **BU**.
- **Report text:**
  - Six headlines and `Subtitle`.
  - Pipe titles: the existing title measures are rewritten, and new ones are added for the new visuals.
  - `Tooltip Title`, `Tooltip Summary`.
- **Report visuals (SVG, ImageUrl):**
  - 4 KPI tiles.
  - `Monthly Hero SVG` (rewritten).
  - `Focus Channel Monthly SVG`, `Margin Bridge SVG`, `Outlook Monthly SVG`, `Outlook Pace SVG`, `Tooltip Monthly SVG`, `IBCS Legend SVG`.
- **Removed (unused):** `Channel Hero SVG`, `Scenario Bars SVG`.
- **Tests:**
  - T8: the "(none selected)" row now expects BU.
  - T8b: covers the new SVG measures.
  - New T9: margin bridge.
  - New T10: driver table.
  - New T11: the numbers inside each headline.

No SQL view or column changes, so no refresh is needed.
