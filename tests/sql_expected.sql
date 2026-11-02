/*
    Expected values for tests/dax_tests.dax, computed from the source tables (Data.*)
    rather than the model views, so the views are tested too.
    Run: uv run tools/sql.py -f tests/sql_expected.sql
*/

-- T1  AC 2025 by country
SELECT CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END CountryCode,
       CAST(SUM(s.Quantity * s.NetPrice) AS decimal(19,2)) AC
FROM Data.Sales s JOIN Data.Store st ON st.StoreKey = s.StoreKey
WHERE s.OrderDate >= '2025-01-01' AND s.OrderDate < '2026-01-01'
GROUP BY ROLLUP (CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END)
ORDER BY GROUPING(CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END), 1;
GO

-- T2  AC 2025 and PY (2024) by month
SELECT m.Mo,
       CAST(SUM(CASE WHEN YEAR(s.OrderDate) = 2025 THEN s.Quantity * s.NetPrice END) AS decimal(19,2)) AC,
       CAST(SUM(CASE WHEN YEAR(s.OrderDate) = 2024 THEN s.Quantity * s.NetPrice END) AS decimal(19,2)) PY
FROM Data.Sales s
CROSS APPLY (SELECT MONTH(s.OrderDate) Mo) m
WHERE s.OrderDate >= '2024-01-01' AND s.OrderDate < '2026-01-01'
GROUP BY ROLLUP (m.Mo)
ORDER BY GROUPING(m.Mo), m.Mo;
GO

-- T3  BU and FC 2025 by country x category (plan view), with AC from source
WITH ac AS (
    SELECT CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END CountryCode, p.CategoryName,
           SUM(s.Quantity * s.NetPrice) AC
    FROM Data.Sales s JOIN Data.Store st ON st.StoreKey = s.StoreKey JOIN Data.Product p ON p.ProductKey = s.ProductKey
    WHERE s.OrderDate >= '2025-01-01' AND s.OrderDate < '2026-01-01'
    GROUP BY CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END, p.CategoryName
), pl AS (
    SELECT ps.CountryCode, c.CategoryName,
           SUM(CASE WHEN ps.Scenario = N'BU' THEN ps.SalesAmountUSD END) BU,
           SUM(CASE WHEN ps.Scenario = N'FC' THEN ps.SalesAmountUSD END) FC
    FROM model.PlanSales ps
    JOIN (SELECT DISTINCT CategoryKey, CategoryName FROM Data.Product) c ON c.CategoryKey = ps.CategoryKey
    GROUP BY ps.CountryCode, c.CategoryName
)
SELECT pl.CountryCode, pl.CategoryName,
       CAST(ac.AC AS decimal(19,2)) AC, CAST(pl.BU AS decimal(19,2)) BU, CAST(pl.FC AS decimal(19,2)) FC
FROM pl LEFT JOIN ac ON ac.CountryCode = pl.CountryCode AND ac.CategoryName = pl.CategoryName
ORDER BY 1, 2;
GO

-- T4  2025 by channel: AC, BU, FC, PY and variances
WITH a AS (
    SELECT CASE WHEN st.CountryCode = N'--' THEN N'Online' ELSE N'Stores' END Channel,
           SUM(CASE WHEN YEAR(s.OrderDate) = 2025 THEN s.Quantity * s.NetPrice END) AC,
           SUM(CASE WHEN YEAR(s.OrderDate) = 2024 THEN s.Quantity * s.NetPrice END) PY
    FROM Data.Sales s JOIN Data.Store st ON st.StoreKey = s.StoreKey
    WHERE s.OrderDate >= '2024-01-01' AND s.OrderDate < '2026-01-01'
    GROUP BY CASE WHEN st.CountryCode = N'--' THEN N'Online' ELSE N'Stores' END
), p AS (
    SELECT CASE WHEN CountryCode = N'ONL' THEN N'Online' ELSE N'Stores' END Channel,
           SUM(CASE WHEN Scenario = N'BU' THEN SalesAmountUSD END) BU,
           SUM(CASE WHEN Scenario = N'FC' THEN SalesAmountUSD END) FC
    FROM model.PlanSales
    GROUP BY CASE WHEN CountryCode = N'ONL' THEN N'Online' ELSE N'Stores' END
), j AS (
    SELECT a.Channel, a.AC, a.PY, p.BU, p.FC FROM a JOIN p ON p.Channel = a.Channel
    UNION ALL
    SELECT N'(Total)', SUM(a.AC), SUM(a.PY), SUM(p.BU), SUM(p.FC) FROM a JOIN p ON p.Channel = a.Channel
)
SELECT Channel,
       CAST(AC AS decimal(19,2)) AC, CAST(BU AS decimal(19,2)) BU, CAST(AC - BU AS decimal(19,2)) [ΔBU],
       CAST(100 * (AC - BU) / BU AS decimal(9,2)) [ΔBU% (pct)], CAST(FC AS decimal(19,2)) FC, CAST(100 * (AC - FC) / FC AS decimal(9,2)) [ΔFC% (pct)],
       CAST(PY AS decimal(19,2)) PY, CAST(100 * (AC - PY) / PY AS decimal(9,2)) [ΔPY% (pct)]
FROM j ORDER BY CASE WHEN Channel = N'(Total)' THEN 1 ELSE 0 END, Channel;
GO

-- T5  YTD through June 2025
SELECT CAST((SELECT SUM(Quantity * NetPrice) FROM Data.Sales WHERE OrderDate >= '2025-01-01' AND OrderDate < '2025-07-01') AS decimal(19,2)) [AC YTD],
       CAST((SELECT SUM(Quantity * NetPrice) FROM Data.Sales WHERE OrderDate >= '2024-01-01' AND OrderDate < '2024-07-01') AS decimal(19,2)) [PY YTD],
       CAST((SELECT SUM(SalesAmountUSD) FROM model.PlanSales WHERE Scenario = N'BU' AND MonthStart < '2025-07-01') AS decimal(19,2)) [BU YTD],
       CAST((SELECT SUM(SalesAmountUSD) FROM model.PlanSales WHERE Scenario = N'FC' AND MonthStart < '2025-07-01') AS decimal(19,2)) [FC YTD];
GO

-- T6  Gross margin 2025 and 2024
SELECT YEAR(OrderDate) Yr,
       CAST(SUM(Quantity * NetPrice) AS decimal(19,2)) NetSales,
       CAST(SUM(Quantity * UnitCost) AS decimal(19,2)) Cost,
       CAST(SUM(Quantity * NetPrice) - SUM(Quantity * UnitCost) AS decimal(19,2)) GrossMargin,
       CAST(100 * (SUM(Quantity * NetPrice) - SUM(Quantity * UnitCost)) / SUM(Quantity * NetPrice) AS decimal(9,2)) [GrossMargin% (pct)],
       SUM(Quantity) Quantity
FROM Data.Sales
WHERE OrderDate >= '2024-01-01' AND OrderDate < '2026-01-01'
GROUP BY YEAR(OrderDate) ORDER BY 1 DESC;
GO

-- T7  Budget at plan grain (the finer-grain rows of the DAX test must be blank)
SELECT N'Total' Test, CAST(SUM(SalesAmountUSD) AS decimal(19,2)) BU FROM model.PlanSales WHERE Scenario = N'BU'
UNION ALL SELECT N'Category = Computers', CAST(SUM(SalesAmountUSD) AS decimal(19,2)) FROM model.PlanSales WHERE Scenario = N'BU' AND CategoryKey = 3
UNION ALL SELECT N'Channel = Online / Country Code = ONL', CAST(SUM(SalesAmountUSD) AS decimal(19,2)) FROM model.PlanSales WHERE Scenario = N'BU' AND CountryCode = N'ONL'
UNION ALL SELECT N'Month = Mar 2025', CAST(SUM(SalesAmountUSD) AS decimal(19,2)) FROM model.PlanSales WHERE Scenario = N'BU' AND YearMonthKey = 202503;
GO

-- T8  Comparison switch: CMP, ΔCMP, ΔCMP % for 2025 per comparison (nothing selected = PY)
WITH t AS (
    SELECT (SELECT SUM(Quantity * NetPrice) FROM Data.Sales WHERE OrderDate >= '2025-01-01' AND OrderDate < '2026-01-01') AC,
           (SELECT SUM(Quantity * NetPrice) FROM Data.Sales WHERE OrderDate >= '2024-01-01' AND OrderDate < '2025-01-01') PY,
           (SELECT SUM(SalesAmountUSD) FROM model.PlanSales WHERE Scenario = N'BU') BU,
           (SELECT SUM(SalesAmountUSD) FROM model.PlanSales WHERE Scenario = N'FC') FC
), c AS (
    SELECT N'(none selected)' Comparison, 0 o, PY CMP, AC FROM t
    UNION ALL SELECT N'PY', 1, PY, AC FROM t
    UNION ALL SELECT N'BU', 2, BU, AC FROM t
    UNION ALL SELECT N'FC', 3, FC, AC FROM t
)
SELECT Comparison, CAST(CMP AS decimal(19,2)) CMP, CAST(AC - CMP AS decimal(19,2)) [ΔCMP],
       CAST(100 * (AC - CMP) / CMP AS decimal(9,2)) [ΔCMP% (pct)]
FROM c ORDER BY o;
GO
