/*
    Plan data for 2025: budget (BU) and forecast (FC) at category x country x month.
    Run: uv run tools/sql.py -f sql/model_plan.sql

    Amounts are USD. Source prices are already USD (ExchangeRate converts USD to local
    currency), so net sales = Quantity * NetPrice.

    BU  = 2024 net sales of the category x country
          x (1 + category growth target from model.PlanGrowthTarget)
          phased by the category's 2024 monthly profile (all countries pooled).
    FC  = Jan-Jun: 2025 actuals.
          Jul-Dec: budget closing half of the H1 gap:
                   BU x (0.5 + 0.5 x H1 actual / H1 budget), per category x country.

    The online store's CountryCode '--' is relabelled 'ONL', matching model.DimStore.
    Keys for the semantic model: PlanVersionKey (-> model.PlanVersion), YearMonthKey
    (-> model.DimDate), CategoryKey (-> model.DimProduct), CountryCode (-> model.DimStore).
*/

-- Plan version dimension (IBCS scenario codes). AC and PY come from actuals, not from here.
DROP VIEW IF EXISTS model.Scenario;
GO
CREATE OR ALTER VIEW model.PlanVersion AS
SELECT PlanVersionKey, Scenario, ScenarioName, SortOrder
FROM (VALUES
    (1, N'BU', N'Budget',   3),
    (2, N'FC', N'Forecast', 4)
) v (PlanVersionKey, Scenario, ScenarioName, SortOrder);
GO

-- Budget growth target per category, 2025 vs 2024
CREATE OR ALTER VIEW model.PlanGrowthTarget AS
SELECT CategoryKey, CAST(GrowthPct AS decimal(5,4)) GrowthPct
FROM (VALUES
    (1, 0.06),  -- Audio
    (2, 0.04),  -- TV and Video
    (3, 0.08),  -- Computers
    (4, 0.03),  -- Cameras and camcorders
    (5, 0.12),  -- Cell phones
    (6, 0.05),  -- Music, Movies and Audio Books
    (7, 0.10),  -- Games and Toys
    (8, 0.07)   -- Home Appliances
) g (CategoryKey, GrowthPct);
GO

-- Plan fact: BU and FC, monthly, category x store country
CREATE OR ALTER VIEW model.PlanSales AS
WITH Cell AS (     -- one scan of Sales: 2024 (PY) and 2025 (AC) per category x country x month
    SELECT p.CategoryKey,
           CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END CountryCode,
           MONTH(s.OrderDate) Mo,
           SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity * s.NetPrice END) PY,
           SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity * s.NetPrice END) AC,
           -- category seasonality: month share of the category's 2024 total, all countries pooled
           CAST(SUM(SUM(CASE WHEN s.OrderDate < '2025-01-01' THEN s.Quantity * s.NetPrice END))
                    OVER (PARTITION BY p.CategoryKey, MONTH(s.OrderDate)) AS float)
             / CAST(SUM(SUM(CASE WHEN s.OrderDate < '2025-01-01' THEN s.Quantity * s.NetPrice END))
                    OVER (PARTITION BY p.CategoryKey) AS float) Season
    FROM Data.Sales s
    JOIN Data.Product p ON p.ProductKey = s.ProductKey
    JOIN Data.Store st  ON st.StoreKey  = s.StoreKey
    WHERE s.OrderDate >= '2024-01-01' AND s.OrderDate < '2026-01-01'
    GROUP BY p.CategoryKey, st.CountryCode, MONTH(s.OrderDate)
),
Budget AS (
    SELECT c.CategoryKey, c.CountryCode, c.Mo, c.AC,
           CAST(SUM(c.PY) OVER (PARTITION BY c.CategoryKey, c.CountryCode) AS float)
             * (1 + g.GrowthPct) * c.Season BU
    FROM Cell c
    JOIN model.PlanGrowthTarget g ON g.CategoryKey = c.CategoryKey
),
Forecast AS (
    SELECT CategoryKey, CountryCode, Mo, BU,
           CASE WHEN Mo <= 6 THEN ISNULL(CAST(AC AS float), 0)
                ELSE BU * (0.5 + 0.5
                           * SUM(CASE WHEN Mo <= 6 THEN CAST(AC AS float) END) OVER (PARTITION BY CategoryKey, CountryCode)
                           / SUM(CASE WHEN Mo <= 6 THEN BU END) OVER (PARTITION BY CategoryKey, CountryCode))
           END FC
    FROM Budget
)
SELECT v.PlanVersionKey,
       CAST(v.Scenario AS nvarchar(2)) Scenario,
       DATEFROMPARTS(2025, f.Mo, 1) MonthStart,
       CAST(2025 * 100 + f.Mo AS int) YearMonthKey,
       f.CategoryKey,
       CAST(f.CountryCode AS nvarchar(3)) CountryCode,
       CAST(v.Amount AS decimal(19,4)) SalesAmountUSD
FROM Forecast f
CROSS APPLY (VALUES (1, N'BU', f.BU), (2, N'FC', f.FC)) v (PlanVersionKey, Scenario, Amount);
GO
