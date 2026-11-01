# Report Spec

## Report identity
- Report name: Contoso Sales 2025 (existing `Contoso Sales.Report`, currently one empty page)
- Semantic model: `Contoso Sales.SemanticModel` (local PBIP)
- Audience: leadership team
- Primary purpose: see at a glance how 2025 went against PY, BU and FC, and which channel, country and category drive the gaps
- Delivery target: local PBIP only (no publishing)

## Semantic model binding
- Entry mode:          Local Model
- Model name:          Contoso Sales
- connectionString:    byPath ../Contoso Sales.SemanticModel (already in definition.pbir)

## User decisions and constraints
- Scope: 1 overview + 3 driver pages (Channel, Country, Category)
- Page count: 4
- Interactivity: page navigator in the header of every page; cross-filtering on every page (click a month, channel, country or category and every other visual on the page filters); 2 synced slicers (Channel, Country) on every page; no drillthrough or bookmarks
- Design direction: IBCS. AC solid dark grey, PY light grey, BU outlined, FC hatched, variances red/green
- Publishing: none
- Tooling: powerbi-report-author CLI (validate, Desktop preview, screenshots); modeling MCP for the new measures
- Model edit permissions: add 10 scenario measures (see Model requirements); nothing else changes
- Accessibility: WCAG AA text contrast; variances carry +/− signs, not colour alone; alt text on every chart
- Data caveats: titles state the full-year 2025 result for all channels and countries; slicing changes the numbers but not the titles

## Narrative
- Core story: 2025 net sales were $299.9M: −7.7% vs PY and −14.2% vs BU, but +2.4% ahead of the latest FC. The decline is Online (−$31.6M vs PY, −16%; −22% vs BU) plus US stores (−10%); physical stores overall grew +5% and every other country grew. By category, TV and Video (−36%) is the biggest single fall. H1 was −16% vs PY; H2 recovered to +1%.
- Audience promise: one glance answers "how did we do?", one click per driver page answers "why?"
- Key questions answered: How far off PY, BU and FC are we? When did the gap open? Which channel, countries and categories made it?

## Design identity
- Tone: IBCS executive. White canvas, greys for scenarios, colour reserved for variance (red/green only)
- Signature: every page pairs a scenario chart (AC/PY/BU/FC) with an IBCS variance chart (red/green bars) under insight titles

## Page plan
1. **Overview**: "2025 sales of $299.9M: 8% below last year and 14% below budget, but 2% ahead of the latest forecast"
   - Archetype: Executive Summary, variant A (KPI strip + hero trend + side drivers)
   - Visuals: 4 KPI cards (AC with PY/BU/FC reference labels; ΔPY; ΔBU; ΔFC); monthly AC/PY/BU/FC columns; monthly ΔPY variance columns; ΔPY by channel; ΔPY by country
   - Fields/measures: AC, PY, BU, FC, ΔPY, ΔPY %, ΔBU, ΔBU %, ΔFC, ΔFC %; Date[Year Month]; Store[Channel]; Store[Country]
2. **Channel**: "Online lost $31.6M vs last year (−16%) and missed budget by 22%; physical stores grew 5%"
   - Archetype: Comparative Benchmark, variant A
   - Visuals: monthly AC/PY/BU columns, one panel per channel; PY→AC bridge (waterfall) by channel; monthly ΔPY % by channel; channel scorecard table
3. **Country**: "Online and US stores account for the whole decline; every other country grew 7–30% on last year"
   - Archetype: Comparative Benchmark, variant B
   - Visuals: ΔPY by country; ΔBU by country; AC/PY/BU by country; country scorecard table
4. **Category**: "TV and Video fell 36% on last year in both channels; Cameras and Audio grew"
   - Archetype: Comparative Benchmark, variant B
   - Visuals: ΔPY by category; ΔBU by category; ΔPY % matrix category × channel; PY→AC bridge by category

## Design system summary
- Theme: custom IBCS theme on the skill base theme. White page, Segoe UI, light gridlines, no visual borders or shadows
- Color semantics: AC #404040 solid; PY #C8C8C8 solid; BU white fill + #404040 1.5px outline; FC hatched (see decision below); positive variance #2E8540, negative variance #C0392B; all other text #252423 / #605E5C
- Typography: Segoe UI Semibold 20pt page titles, Segoe UI 10–11pt body, data labels in $M with one decimal
- Layout: 1920 × 1080, 12 × 12 grid, 32px margin, 24px gutter
- Accessibility: AA contrast; +/− signs on every variance label; alt text per chart

### Decision needed: hatched FC
Power BI's built-in charts can draw an outlined bar (BU) but have no hatch pattern. Options:
1. **(Recommended) Native charts, FC approximated:** FC drawn as a mid-grey (#7F7F7F) outline with a light tinted fill, labelled "FC". Every visual stays native, so cross-filtering, tooltips and selection work everywhere.
2. **True hatching via SVG measures:** DAX measures that draw hatched bars as images, shown in a table/matrix for the scenario comparisons. Real IBCS look, but only row-level clicks for cross-filtering, no per-bar tooltips, and ~2 extra image measures in the model.
3. **IBCS custom visual (e.g. Zebra BI):** full IBCS notation, but a third-party AppSource visual that needs a licence.

## Model requirements
- Existing measures: Net Sales (with Scenario and Time calculation groups), Gross Margin family
- New measures (Sales table, display folder "Scenarios"): AC, PY, BU, FC, ΔPY, ΔPY %, ΔBU, ΔBU %, ΔFC, ΔFC %. Each is `CALCULATE([Net Sales], 'Scenario'[Scenario] = "<item>")` with a description and format string.
  Why: if a chart puts the Scenario calc group on the legend, clicking a bar also passes a Scenario filter to the other visuals and blanks them. Separate measures keep cross-filtering to month, channel, country and category only. The calc group stays the single source of the logic.
- New calculated columns: none
- Relationship/sort requirements: none (Year Month already sorts by Year Month Key)
- Report-level filter: Date[Year] = 2025 (locked)

## Canonical design contract

```yaml
Design Brief:
  generated_by: powerbi-report-cli
  contract_version: 1
  mode: greenfield
  design_identity:
    tone: "IBCS executive: white canvas, grey scenario notation, colour only for variance"
    signature: "Scenario chart paired with a red/green IBCS variance chart under an insight title on every page"
  archetype: Executive Summary
  navigation_model: page_navigator
  color_map:
    - measure: Sales[AC]
      color: "#404040"
      tint: "#E6E6E6"
    - measure: Sales[PY]
      color: "#C8C8C8"
      tint: "#F2F2F2"
    - measure: Sales[BU]
      color: "#FFFFFF"
      outline: "#404040"
      tint: "#FFFFFF"
    - measure: Sales[FC]
      color: "#E6E6E6"
      outline: "#7F7F7F"
      tint: "#F2F2F2"
      note: "hatched per IBCS; rendering depends on the hatched-FC decision"
    - measure: Sales[ΔPY]
      color: "semantic: >=0 #2E8540, <0 #C0392B"
      tint: "#F2F2F2"
    - measure: Sales[ΔBU]
      color: "semantic: >=0 #2E8540, <0 #C0392B"
      tint: "#F2F2F2"
    - measure: Sales[ΔFC]
      color: "semantic: >=0 #2E8540, <0 #C0392B"
      tint: "#F2F2F2"
  pages:
    - name: "Overview"
      role: landing
      archetype: Executive
      layout_variant: A
      variant_rationale: "One headline result against three baselines, a clear H1/H2 time story and two dominant drivers suit KPI strip + hero trend + side drivers."
      navigation:
        - element: page_navigator
          action: PageNavigation
          label: "Overview | Channel | Country | Category"
      page_background: "#FFFFFF"
      layout_summary: "KPI strip across the top; monthly scenario columns with variance columns beneath on the left; channel and country variance bars on the right."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:  [1, 1, 6, 2]
            nav:     [6, 1, 10, 2]
            filters: [10, 1, 13, 2]
            kpis:    [1, 2, 13, 4]
            trend:   [1, 4, 9, 9]
            trend_var: [1, 9, 9, 13]
            drivers: [9, 4, 13, 13]
        placements:
          - id: page_title
            region: header
            kind: textbox
            text: "2025 sales of $299.9M: 8% below last year and 14% below budget, but 2% ahead of the latest forecast"
            purpose: "State the year's result before any chart."
          - id: page_nav
            region: nav
            kind: pageNavigator
            purpose: "Move between the overview and the three driver pages."
          - id: channel_slicer
            region: filters
            kind: slicer
            field_bindings: Store[Channel]
            slicer_type: dropdown
            slot: 1
            of: 2
          - id: country_slicer
            region: filters
            kind: slicer
            field_bindings: Store[Country]
            slicer_type: dropdown
            slot: 2
            of: 2
          - id: kpi_ac
            region: kpis
            kind: cardVisual
            purpose: "What did we sell in 2025, with PY, BU and FC as references?"
            field_bindings: { Data: Sales[AC], ReferenceLabels: [Sales[PY], Sales[BU], Sales[FC]] }
            color_strategy: measure_match
            insight_basis: "Composite card: AC plus PY/BU/FC reference labels."
            slot: 1
            of: 4
          - id: kpi_dpy
            region: kpis
            kind: cardVisual
            purpose: "How far are we from last year?"
            field_bindings: { Data: Sales[ΔPY], ReferenceLabels: [Sales[ΔPY %]] }
            color_strategy: semantic
            insight_basis: "Variance to PY in $ and %."
            comparison_basis: PY
            slot: 2
            of: 4
          - id: kpi_dbu
            region: kpis
            kind: cardVisual
            purpose: "How far are we from budget?"
            field_bindings: { Data: Sales[ΔBU], ReferenceLabels: [Sales[ΔBU %]] }
            color_strategy: semantic
            insight_basis: "Variance to BU in $ and %."
            comparison_basis: BU
            slot: 3
            of: 4
          - id: kpi_dfc
            region: kpis
            kind: cardVisual
            purpose: "How far are we from the latest forecast?"
            field_bindings: { Data: Sales[ΔFC], ReferenceLabels: [Sales[ΔFC %]] }
            color_strategy: semantic
            insight_basis: "Variance to FC in $ and %."
            comparison_basis: FC
            slot: 4
            of: 4
          - id: monthly_scenarios
            region: trend
            kind: clusteredColumnChart
            purpose: "Month by month, how did AC compare with PY, BU and FC? (H1 −16% vs PY, H2 +1%)"
            field_bindings: { Category: Date[Year Month], Y: [Sales[PY], Sales[AC], Sales[BU], Sales[FC]] }
            sort_policy: natural_order
            color_strategy: measure_match
          - id: monthly_dpy
            region: trend_var
            kind: clusteredColumnChart
            purpose: "In which months did we lose or gain against last year?"
            field_bindings: { Category: Date[Year Month], Y: Sales[ΔPY] }
            sort_policy: natural_order
            color_strategy: semantic
            comparison_basis: PY
          - id: channel_dpy
            region: drivers
            kind: clusteredBarChart
            purpose: "Which channel drove the gap to last year?"
            field_bindings: { Category: Store[Channel], X: Sales[ΔPY] }
            sort_policy: value_asc
            color_strategy: semantic
            comparison_basis: PY
            slot: 1
            of: 2
          - id: country_dpy
            region: drivers
            kind: clusteredBarChart
            purpose: "Which countries drove the gap to last year?"
            field_bindings: { Category: Store[Country], X: Sales[ΔPY] }
            sort_policy: value_asc
            color_strategy: semantic
            comparison_basis: PY
            slot: 2
            of: 2
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: trend, pct_of_content: 30 }
          balance_rationale: "The monthly scenario chart carries the time story and gets the largest region; its variance chart sits directly beneath on the same x-axis; channel and country drivers share the right column."
    - name: "Channel"
      role: detail
      archetype: Comparative
      layout_variant: A
      variant_rationale: "Two channels with opposite directions: per-channel panels side by side make the contrast obvious."
      navigation:
        - element: page_navigator
          action: PageNavigation
          label: "Overview | Channel | Country | Category"
      page_background: "#FFFFFF"
      layout_summary: "Per-channel monthly scenario panels top left, PY→AC bridge top right; monthly ΔPY % by channel bottom left, scorecard bottom right."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:  [1, 1, 6, 2]
            nav:     [6, 1, 10, 2]
            filters: [10, 1, 13, 2]
            hero:    [1, 2, 8, 8]
            bridge:  [8, 2, 13, 8]
            trend_var: [1, 8, 8, 13]
            detail:  [8, 8, 13, 13]
        placements:
          - id: page_title
            region: header
            kind: textbox
            text: "Online lost $31.6M vs last year (−16%) and missed budget by 22%; physical stores grew 5%"
          - id: page_nav
            region: nav
            kind: pageNavigator
          - id: channel_slicer
            region: filters
            kind: slicer
            field_bindings: Store[Channel]
            slicer_type: dropdown
            slot: 1
            of: 2
          - id: country_slicer
            region: filters
            kind: slicer
            field_bindings: Store[Country]
            slicer_type: dropdown
            slot: 2
            of: 2
          - id: channel_monthly
            region: hero
            kind: clusteredColumnChart
            purpose: "How did each channel track PY and BU month by month?"
            field_bindings: { Category: Date[Year Month], Y: [Sales[PY], Sales[AC], Sales[BU]], SmallMultiples: Store[Channel] }
            sort_policy: natural_order
            color_strategy: measure_match
          - id: channel_bridge
            region: bridge
            kind: waterfallChart
            purpose: "How does last year's $325.0M become this year's $299.9M by channel?"
            field_bindings: { Category: Store[Channel], Y: Sales[ΔPY] }
            sort_policy: value_asc
            color_strategy: semantic
            comparison_basis: PY
          - id: channel_dpy_pct
            region: trend_var
            kind: clusteredColumnChart
            purpose: "In which months did each channel fall behind last year?"
            field_bindings: { Category: Date[Year Month], Y: Sales[ΔPY %], SmallMultiples: Store[Channel] }
            sort_policy: natural_order
            color_strategy: semantic
            comparison_basis: PY
          - id: channel_scorecard
            region: detail
            kind: tableEx
            purpose: "Exact AC and variances to PY, BU and FC per channel."
            field_bindings: [Store[Channel], Sales[AC], Sales[PY], Sales[ΔPY %], Sales[BU], Sales[ΔBU %], Sales[FC], Sales[ΔFC %]]
            sort_policy: value_desc
            color_strategy: semantic
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: hero, pct_of_content: 32 }
          balance_rationale: "Monthly per-channel panels need width for 12 months x 2 panels; bridge and scorecard are compact and readable at 5 columns."
    - name: "Country"
      role: detail
      archetype: Comparative
      layout_variant: B
      variant_rationale: "Nine countries ranked by variance: three side-by-side ranked bars over a full-width scorecard."
      navigation:
        - element: page_navigator
          action: PageNavigation
          label: "Overview | Channel | Country | Category"
      page_background: "#FFFFFF"
      layout_summary: "Three ranked country charts across the top (ΔPY, ΔBU, AC/PY/BU), full-width scorecard below."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:  [1, 1, 6, 2]
            nav:     [6, 1, 10, 2]
            filters: [10, 1, 13, 2]
            var_py:  [1, 2, 5, 8]
            var_bu:  [5, 2, 9, 8]
            scenarios: [9, 2, 13, 8]
            detail:  [1, 8, 13, 13]
        placements:
          - id: page_title
            region: header
            kind: textbox
            text: "Online and US stores account for the whole decline; every other country grew 7–30% on last year"
          - id: page_nav
            region: nav
            kind: pageNavigator
          - id: channel_slicer
            region: filters
            kind: slicer
            field_bindings: Store[Channel]
            slicer_type: dropdown
            slot: 1
            of: 2
          - id: country_slicer
            region: filters
            kind: slicer
            field_bindings: Store[Country]
            slicer_type: dropdown
            slot: 2
            of: 2
          - id: country_dpy
            region: var_py
            kind: clusteredBarChart
            purpose: "Which countries gained or lost against last year?"
            field_bindings: { Category: Store[Country], X: Sales[ΔPY] }
            sort_policy: value_asc
            color_strategy: semantic
            comparison_basis: PY
          - id: country_dbu
            region: var_bu
            kind: clusteredBarChart
            purpose: "Which countries beat or missed budget?"
            field_bindings: { Category: Store[Country], X: Sales[ΔBU] }
            sort_policy: value_asc
            color_strategy: semantic
            comparison_basis: BU
          - id: country_scenarios
            region: scenarios
            kind: clusteredBarChart
            purpose: "How big is each country in AC, PY and BU?"
            field_bindings: { Category: Store[Country], X: [Sales[PY], Sales[AC], Sales[BU]] }
            sort_policy: value_desc
            color_strategy: measure_match
          - id: country_scorecard
            region: detail
            kind: tableEx
            purpose: "Exact AC and variances to PY, BU and FC per country."
            field_bindings: [Store[Country], Store[Channel], Sales[AC], Sales[PY], Sales[ΔPY], Sales[ΔPY %], Sales[BU], Sales[ΔBU], Sales[ΔBU %], Sales[FC], Sales[ΔFC %]]
            sort_policy: value_asc
            color_strategy: semantic
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: detail, pct_of_content: 45 }
          balance_rationale: "Three equal ranked charts answer gap/plan/size; the scorecard gets the full width for 11 columns of exact figures."
    - name: "Category"
      role: detail
      archetype: Comparative
      layout_variant: B
      variant_rationale: "Eight categories with a channel split: ranked variance bars on top, channel matrix and bridge below."
      navigation:
        - element: page_navigator
          action: PageNavigation
          label: "Overview | Channel | Country | Category"
      page_background: "#FFFFFF"
      layout_summary: "ΔPY and ΔBU by category across the top; category × channel ΔPY % matrix and PY→AC bridge by category below."
      layout_contract:
        canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
        grid:
          columns: 12
          rows: 12
          regions:
            header:  [1, 1, 6, 2]
            nav:     [6, 1, 10, 2]
            filters: [10, 1, 13, 2]
            var_py:  [1, 2, 7, 7]
            var_bu:  [7, 2, 13, 7]
            matrix:  [1, 7, 7, 13]
            bridge:  [7, 7, 13, 13]
        placements:
          - id: page_title
            region: header
            kind: textbox
            text: "TV and Video fell 36% on last year in both channels; Cameras and Audio grew"
          - id: page_nav
            region: nav
            kind: pageNavigator
          - id: channel_slicer
            region: filters
            kind: slicer
            field_bindings: Store[Channel]
            slicer_type: dropdown
            slot: 1
            of: 2
          - id: country_slicer
            region: filters
            kind: slicer
            field_bindings: Store[Country]
            slicer_type: dropdown
            slot: 2
            of: 2
          - id: category_dpy
            region: var_py
            kind: clusteredBarChart
            purpose: "Which categories gained or lost against last year?"
            field_bindings: { Category: Product[Category], X: Sales[ΔPY] }
            sort_policy: value_asc
            color_strategy: semantic
            comparison_basis: PY
          - id: category_dbu
            region: var_bu
            kind: clusteredBarChart
            purpose: "Which categories beat or missed budget?"
            field_bindings: { Category: Product[Category], X: Sales[ΔBU] }
            sort_policy: value_asc
            color_strategy: semantic
            comparison_basis: BU
          - id: category_channel_matrix
            region: matrix
            kind: pivotTable
            purpose: "Is each category's change the same online and in stores?"
            field_bindings: { Rows: Product[Category], Columns: Store[Channel], Values: [Sales[AC], Sales[ΔPY %]] }
            sort_policy: value_asc
            color_strategy: semantic
          - id: category_bridge
            region: bridge
            kind: waterfallChart
            purpose: "How does last year's total become this year's by category?"
            field_bindings: { Category: Product[Category], Y: Sales[ΔPY] }
            sort_policy: value_asc
            color_strategy: semantic
            comparison_basis: PY
        space_audit:
          content_cell_count: 132
          placed_cell_count: 132
          empty_cell_pct: 0
          unplaced_regions: []
          largest_region: { name: matrix, pct_of_content: 27 }
          balance_rationale: "Four equal quadrants: two ranked variance views and two decomposition views, none starving the others."
  interaction_pattern:
    drill_targets: []
    cross_filter_rules: "Filter between all data visuals on every page (bars, columns, waterfall, table, matrix); cards receive filters; slicers filter everything and are synced across all pages."
  accessibility:
    alt_text_strategy: "comparison framing: what is compared, against which baseline, and the headline gap"
    contrast_notes: "Light-grey PY bars sit on white; they carry a data label or tooltip, and PY is never the only series. Variance colours pass 4.5:1 on white and labels include +/− signs."
  theme:
    base: "references/design/assets/base.json adapted to IBCS greys and red/green semantics"
    user_overrides: "none (no existing brand theme)"
```

## Implementation notes
- Model changes: add 10 scenario measures through the modeling MCP on the PBIP folder; re-export TMDL; run `uv run tools/validate_pbip.py`; re-run the DAX tests against Desktop after the reload and show the comparison table (CLAUDE.md rules).
- PBIR/report authoring: replace the empty "Overview" page; custom theme; 4 pages; report filter Year = 2025.
- Validation: `powerbi-report-author validate` after each page; Desktop reload; screenshot every page; review and polish until clean; check cross-filtering by clicking through each visual.
- Desktop screenshot verification: all 4 pages.
- Publishing boundary: none.
- Risks: no native hatch fill (see decision); waterfall colours for increase/decrease are set per chart, not per measure; small multiples need enough width for 12 month labels.
