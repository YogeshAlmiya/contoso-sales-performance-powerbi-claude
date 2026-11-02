# Prep data for AI: Contoso Sales

Paste into Power BI Desktop: **Home > Prep data for AI**. The three parts below match its three tabs. Synonyms are already in the model (en-US culture); section 4 lists them for review.

Model state this draft assumes:
- Every table, column, measure and calculation item has a description of at most 200 characters, with the key information first.
- The 51 report helper measures are hidden and described "Report only": SVG images, headlines, titles, subtitles, tooltip text, the Compare with and CMP measures, and the chart end labels.
- The Comparison, Plan and Plan Version tables are hidden.

---

## 1. AI instructions

Copy everything between the lines into **Add AI instructions**.

---

This model holds Contoso sales (an electronics retailer with physical stores and an online store) in USD. Actuals run from 18 May 2016 to 31 Dec 2025. Budget and forecast exist for 2025 only.

Default year: when no year is given, use 2025 (the latest complete year and the only one with BU and FC). 2016 is a partial year.

Vocabulary and measures:
- Revenue, sales and turnover mean [Net Sales] (after discounts).
- COGS and cost of sales mean [Cost].
- Gross profit means [Gross Margin].
- Margin rate and GM% mean [Gross Margin %].
- Units and volume mean [Sales Quantity].
- Average selling price (ASP) means [Avg Net Price].

Scenarios (IBCS codes):
- AC: actual.
- PY: previous year, the same period one year earlier.
- BU: budget 2025.
- FC: forecast 6+6, which means January to June actuals plus the July to December forecast made in June.

Use the measures [AC], [PY], [BU], [FC], [ΔPY], [ΔPY %], [ΔBU], [ΔBU %], [ΔFC] and [ΔFC %] for revenue. For any other measure, use the Scenario calculation group ('Scenario'[Scenario] = "PY", "ΔPY", "ΔPY%" and so on). [AC] and [Net Sales] are the same number.

Plan grain:
- BU and FC exist only for revenue (Net Sales), at month × product category × country. Channel works too, because each country belongs to one channel.
- BU and FC are blank below that grain: by day, weekday, working day, store, state, brand, subcategory or product. Never present a blank budget as zero. Say the budget is set by month, category and country.
- There is no budget or forecast for margin, cost, units or prices. Compare those with last year (PY) instead.

Reading variances:
- Δ means actual minus the comparison. ΔBU = AC − BU, ΔPY = AC − PY, ΔFC = AC − FC. Δ % is relative to the comparison, for example (AC − BU) / BU.
- pp means percentage points and is used for rate changes: [Gross Margin % ΔPY pp] = this year's margin rate minus last year's.
- ΔFC is zero from January to June, because FC equals actuals in those months.

Direction of good:
- Higher revenue, units, gross profit and margin rate are good. Positive ΔPY, ΔBU and ΔFC on these are good. Below budget is bad.
- For cost, average unit cost and [Avg Unit Cost ΔPY %], a rise is bad.
- In the margin bridge measures ([Margin Volume Effect], [Margin Mix Effect], [Margin Price Effect], [Margin Unit Cost Effect]), a negative value lowered gross profit. The four add up to [Gross Margin ΔPY].

Time: the Time calculation group gives Current, MTD, QTD and YTD for any measure. It combines with Scenario. For example, Time = YTD with ΔBU is the year-to-date gap to budget, and YTD with PY is last year's year to date.

Dimensions:
- Channel is Online (the online store, Country = "Online", Country Code = "ONL") or Stores (physical shops).
- Region and market mean Country.
- Product line means Category (8 categories).
- Use 'Date'[Year Month] for monthly trends, not 'Date'[Month], which mixes years.

Answers: show amounts in USD millions with one decimal (e.g. $49.6M) and percentages with one decimal. When comparing with budget, also give the gap in USD and in %.

---

Length: about 3,100 characters (the limit is 10,000).

---

## 2. AI data schema

In **Simplify the data schema**, select only the objects below. Hidden objects should already be unticked; check that none of the excluded ones is ticked.

**Include**

| Table | Columns | Measures |
|---|---|---|
| Sales | none | Net Sales, Sales Quantity, Cost, Gross Margin, Gross Margin %, AC, PY, BU, FC, ΔPY, ΔPY %, ΔBU, ΔBU %, ΔFC, ΔFC %, Avg Net Price, Avg Unit Cost, Units ΔPY %, Avg Net Price ΔPY %, Avg Unit Cost ΔPY %, Gross Margin PY, Gross Margin ΔPY, Gross Margin ΔPY %, Gross Margin % PY, Gross Margin % ΔPY pp, Margin Volume Effect, Margin Mix Effect, Margin Price Effect, Margin Unit Cost Effect |
| Date | Date, Year, Quarter, Year Quarter, Month, Year Month, Day of Week, Working Day | none |
| Product | Product Name, Brand, Subcategory, Category | none |
| Store | Store Name, State, Country Code, Country, Channel, Status | none |
| Scenario | Scenario | none |
| Time | Time | none |

**Exclude** (report-only or technical):
- **Tables:** Comparison, Plan, Plan Version.
- **Measures:**
  - all measures whose description starts "Report only" (51: SVGs, headlines, subtitles, titles, tooltip text, Comparison Label and Name, CMP, ΔCMP, ΔCMP %, CMP2, ΔCMP2, ΔCMP2 %, CMP2 Label and Name, Focus Channel, ΔCMP Focus Channel, Headline Subject, Gross Margin % Last Month, Gross Margin % PY Last Month)
  - Plan Sales
- **Columns:**
  - the hidden key and sort columns: Date Key, Year Quarter Key, Month Number, Year Month Key, Day of Week Number, Product Key, Category Key, Store Key, Ordinal
  - the hidden Sales columns: Quantity, Net Sales Amount, Cost Amount

---

## 3. Verified answers

Set up each one on the named visual: select the visual, then **Set up a verified answer**. Add the trigger phrases, and keep Compare with on **BU** (the default) unless stated. The expected values come from `tests/sql_expected.sql`; check the visual shows them before you save.

| # | Trigger phrases | Visual (page) | Expected values (2025) | Source |
|---|---|---|---|---|
| 1 | "How did sales compare with budget?", "What is the gap to budget?", "Revenue vs budget 2025" | Driver table, **Total** row (Products) | Sales AC $299.9M (299,946,187.09). ΔBU −$49.6M (−49,601,683.42), −14.2%. BU $349.5M (349,547,870.51). | T4, T8 |
| 2 | "Sales vs budget by channel", "Which channel misses budget?", "Online vs stores" | Sales \| USD m \| ΔBU \| by channel (Overview) | Online −$46.5M (−21.9%; AC 165,991,359.23 vs BU 212,528,576.10). Stores −$3.1M (−2.2%; AC 133,954,827.86 vs BU 137,019,294.41). | T4 |
| 3 | "Which product categories are furthest below budget?", "Budget gap by category" | Sales \| USD m \| ΔBU \| by product category (Overview) | Computers −$18.4M (−14.8%). TV and Video −$16.7M (−38.4%). Home Appliances −$13.1M (−21.8%). Cell phones −$7.8M (−11.4%). Ahead of budget: Cameras and camcorders +$5.1M (+26.5%), Audio +$1.5M (+19.6%), Games and Toys +$0.1M (+4.7%). | T10 |
| 4 | "Which countries are ahead of budget?", "Sales vs budget by country", "Budget gap by market" | Sales \| USD m \| ΔBU \| by country (Regions) | Ahead: Germany +$3.7M (+20.9%), Canada +$2.1M (+13.0%), Netherlands +$1.0M (+13.0%), Australia +$0.7M (+6.9%), Italy +$0.5M (+17.8%), France +$0.0M (+0.1%). Behind: Online −$46.5M (−21.9%), United States −$11.0M (−16.4%), United Kingdom −$0.0M (−0.2%). | T1 + T3 (AC by country, BU by country × category) |
| 5 | "How did gross profit and margin rate change vs last year?", "Gross margin vs last year" | Margin rate \| pp \| ΔPY \| by product category (Margin) | Gross profit $168.1M vs $181.7M PY (−$13.6M, −7.5%). Margin rate 56.0% vs 55.9% (+0.1 pp). Bridge: product mix −$11.7M, volume −$2.0M, price +$0.1M, unit cost $0.0M. | T6, T9 |

Notes:
- The KPI tiles, hero charts and margin bridge are SVG images, so they don't work as verified answers. That's why each answer above uses a native visual.
- For answer 5 the visual shows the margin rate change by category. The totals in the expected values are for checking Copilot's text answer.

---

## 4. Synonyms (already in the model)

These are written to `cultures/en-US.tmdl` as authored terms. Edit them in Desktop under **Model view > Synonyms** (or the Q&A setup) if you want changes. No synonym is used for two objects; `tools/validate_pbip.py` checks this across tables and fields.

| Object | Synonyms |
|---|---|
| Sales (table) | transactions, sales data, orders |
| Store (table) | shop, outlet, branch |
| Product (table) | item, article, sku |
| Date (table) | calendar, dates |
| Scenario (table) | version, scenario type |
| Time (table) | period to date, time intelligence |
| Store Name | shop name, outlet name |
| Country | market, region, country name |
| Country Code | iso country code |
| Channel | sales channel, channel type |
| State | province, state or province |
| Status | store status, open or closed |
| Product Name | item name, sku name |
| Category | product category, product line |
| Subcategory | product subcategory, sub category |
| Brand | manufacturer, make |
| Year | calendar year |
| Year Month | year and month, monthly period |
| Month | month name |
| Quarter | qtr |
| Year Quarter | year and quarter |
| Day of Week | weekday, day name |
| Working Day | business day, workday |
| Scenario (column) | actual budget forecast, plan version |
| Time (column) | ytd mtd qtd |
| Net Sales | revenue, sales, turnover, net revenue, sales amount |
| Sales Quantity | units, units sold, volume, quantity |
| Cost | cogs, cost of goods sold, cost of sales |
| Gross Margin | gross profit, margin, gp |
| Gross Margin % | margin rate, gross margin percent, gm%, margin % |
| AC | actual, actuals, actual sales |
| PY | last year, prior year, previous year, ly |
| BU | budget, plan, target |
| FC | forecast, latest forecast, outlook |
| ΔPY | change vs last year, variance to last year, yoy change |
| ΔPY % | growth, yoy growth, year over year % |
| ΔBU | gap to budget, variance to budget, budget variance |
| ΔBU % | % vs budget, budget variance % |
| ΔFC | variance to forecast, gap to forecast |
| ΔFC % | % vs forecast, forecast variance % |
| Avg Net Price | asp, average selling price, average price |
| Avg Unit Cost | average unit cost, cost per unit |
| Units ΔPY % | unit growth, volume growth |
| Avg Net Price ΔPY % | price change, asp change |
| Avg Unit Cost ΔPY % | unit cost change |
| Gross Margin PY | last year gross profit |
| Gross Margin ΔPY | gross profit change |
| Gross Margin ΔPY % | gross profit growth |
| Gross Margin % PY | last year margin rate |
| Gross Margin % ΔPY pp | margin rate change, margin pp change |
| Margin Volume Effect | volume effect |
| Margin Mix Effect | mix effect, product mix effect |
| Margin Price Effect | price effect |
| Margin Unit Cost Effect | cost effect, unit cost effect |
