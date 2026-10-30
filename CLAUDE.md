# Contoso Sales Performance

Power BI development for **Contoso**, a fictional electronics retailer selling through physical stores and online. Work happens in this folder as Power BI Projects (PBIP: TMDL semantic models, PBIR reports). I open and publish them from Power BI Desktop.

## Data source

- **SQL Server 2022** `Contoso1M` on `localhost`. Source tables are in schema `Data`: Sales, Orders, OrderRows, Customer, Product, Store, Date, CurrencyExchange. Schema `model` is empty and yours.
- Sales history runs from 2016-05-18 to 2025-12-31. 2016 is a partial year; 2025 is the latest complete year.
- Amounts (UnitPrice, NetPrice, UnitCost) are in USD: the same product has the same price in every currency on a given day. `ExchangeRate` converts USD to the order's local currency (it equals `Data.CurrencyExchange` USD → CurrencyCode on the order date). Report everything in USD: net sales = Quantity × NetPrice, with no exchange rate.
- The online store (StoreKey 999999) has CountryCode `--` in the source; model views relabel it `ONL` (CountryName `Online`).
- There is no budget or forecast in the source. Plan data is built as SQL views in `model`.
- Read structure before modelling: `uv run tools/sql.py --describe` (all) or `--describe Data.Sales` (one).
- Query with `uv run tools/sql.py "<SQL>"`, or run a script with `-f file.sql` (batches separated by `GO`). Options: `--format csv|json`, `--max-rows 0`. The login reads every table, can create views only in schema `model`, and cannot change data.

## Modelling conventions

- Do all data preparation in SQL, as views in schema `model`. Semantic model tables point at a view and nothing more: no Power Query transformation steps.
- Storage modes: dimensions and actuals in Import; the plan fact (budget and forecast) in DirectQuery.
- Plan versions are a dimension of their own. Scenario names follow IBCS: AC, PY, BU, FC.
- Every measure has a description, display folder and format string.

## Machine limits

- Laptop with 16 GB RAM; SQL Server is capped at 6 GB. Keep the model lean: only the columns the report needs, integer keys, no high-cardinality text columns unless required.

## Power BI Desktop

- I run Power BI Desktop on this same machine. Work on the PBIP files in this folder; don't connect to my running Desktop instance unless I ask.
- Build PBIP projects Desktop can open (a `.pbip` file next to its `.SemanticModel` and `.Report` folders).
- After changing a project I have open, tell me to reload it in Desktop. Don't change it while I'm editing.

## Working style

- I'm learning this workflow. Show your plan before building anything, and briefly explain why you chose each design.
- Test key measures against SQL and show me the comparison.
- Keep everything inside this folder.
- Before telling me to open or reload a project in Desktop, run `uv run tools/validate_pbip.py` and fix any failures.
- DAX tests live in `tests/dax_tests.dax` with expected values from `tests/sql_expected.sql`; after any model change, re-run them against Desktop and show the comparison table.