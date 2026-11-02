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

-- T8  Comparison switch: CMP, ΔCMP, ΔCMP % for 2025 per comparison (nothing selected = BU)
WITH t AS (
    SELECT (SELECT SUM(Quantity * NetPrice) FROM Data.Sales WHERE OrderDate >= '2025-01-01' AND OrderDate < '2026-01-01') AC,
           (SELECT SUM(Quantity * NetPrice) FROM Data.Sales WHERE OrderDate >= '2024-01-01' AND OrderDate < '2025-01-01') PY,
           (SELECT SUM(SalesAmountUSD) FROM model.PlanSales WHERE Scenario = N'BU') BU,
           (SELECT SUM(SalesAmountUSD) FROM model.PlanSales WHERE Scenario = N'FC') FC
), c AS (
    SELECT N'(none selected)' Comparison, 0 o, BU CMP, AC FROM t
    UNION ALL SELECT N'PY', 1, PY, AC FROM t
    UNION ALL SELECT N'BU', 2, BU, AC FROM t
    UNION ALL SELECT N'FC', 3, FC, AC FROM t
)
SELECT Comparison, CAST(CMP AS decimal(19,2)) CMP, CAST(AC - CMP AS decimal(19,2)) [ΔCMP],
       CAST(100 * (AC - CMP) / CMP AS decimal(9,2)) [ΔCMP% (pct)]
FROM c ORDER BY o;
GO

-- T9  Margin bridge PY -> AC 2025 by channel and total, at product grain:
--     volume = unit change x PY margin per unit; price and unit cost = change per unit for products sold in both
--     years x 2025 units; mix = the rest of the margin change
WITH p AS (
    SELECT CASE WHEN st.CountryCode = N'--' THEN N'Online' ELSE N'Stores' END Channel, s.ProductKey,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity END) AS float) Q1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity END) AS float) Q0,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity * s.NetPrice END) AS float) N1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity * s.NetPrice END) AS float) N0,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity * s.UnitCost END) AS float) C1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity * s.UnitCost END) AS float) C0
    FROM Data.Sales s JOIN Data.Store st ON st.StoreKey = s.StoreKey
    WHERE s.OrderDate >= '2024-01-01' AND s.OrderDate < '2026-01-01'
    GROUP BY GROUPING SETS ((CASE WHEN st.CountryCode = N'--' THEN N'Online' ELSE N'Stores' END, s.ProductKey), (s.ProductKey))
), b AS (
    SELECT Channel,
           SUM(N0) - SUM(C0) GM_PY, SUM(N1) - SUM(C1) GM_AC,
           (SUM(Q1) - SUM(Q0)) * (SUM(N0) - SUM(C0)) / SUM(Q0) Volume,
           SUM(CASE WHEN Q0 > 0 AND Q1 > 0 THEN N1 - Q1 * N0 / Q0 END) Price,
           -SUM(CASE WHEN Q0 > 0 AND Q1 > 0 THEN C1 - Q1 * C0 / Q0 END) UnitCost
    FROM p GROUP BY Channel
)
SELECT ISNULL(Channel, N'Total') Channel, CAST(GM_PY AS decimal(19,2)) [GM PY], CAST(Volume AS decimal(19,2)) Volume,
       CAST(GM_AC - GM_PY - Volume - Price - UnitCost AS decimal(19,2)) Mix, CAST(Price AS decimal(19,2)) Price,
       CAST(UnitCost AS decimal(19,2)) [Unit cost], CAST(GM_AC AS decimal(19,2)) [GM AC], CAST(GM_AC - GM_PY AS decimal(19,2)) [ΔGM]
FROM b ORDER BY CASE WHEN Channel IS NULL THEN 1 ELSE 0 END, Channel;
GO

-- T10 Products driver table 2025: AC, ΔBU, ΔBU %, and units, average price, unit cost and margin rate vs PY
WITH s AS (
    SELECT p.CategoryName Category,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity * s.NetPrice END) AS float) AC,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity * s.NetPrice END) AS float) PY,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity END) AS float) Q1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity END) AS float) Q0,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity * s.UnitCost END) AS float) C1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity * s.UnitCost END) AS float) C0
    FROM Data.Sales s JOIN Data.Product p ON p.ProductKey = s.ProductKey
    WHERE s.OrderDate >= '2024-01-01' AND s.OrderDate < '2026-01-01'
    GROUP BY ROLLUP (p.CategoryName)
), b AS (
    SELECT c.CategoryName Category, CAST(SUM(ps.SalesAmountUSD) AS float) BU
    FROM model.PlanSales ps JOIN (SELECT DISTINCT CategoryKey, CategoryName FROM Data.Product) c ON c.CategoryKey = ps.CategoryKey
    WHERE ps.Scenario = N'BU'
    GROUP BY ROLLUP (c.CategoryName)
)
SELECT ISNULL(s.Category, N'Total') Category, CAST(s.AC AS decimal(19,2)) [Sales AC], CAST(s.AC - b.BU AS decimal(19,2)) [ΔBU],
       CAST(100 * (s.AC / b.BU - 1) AS decimal(9,2)) [ΔBU% (pct)],
       CAST(100 * (s.Q1 / s.Q0 - 1) AS decimal(9,2)) [Units ΔPY% (pct)],
       CAST(100 * ((s.AC / s.Q1) / (s.PY / s.Q0) - 1) AS decimal(9,2)) [Avg price ΔPY% (pct)],
       CAST(100 * ((s.C1 / s.Q1) / (s.C0 / s.Q0) - 1) AS decimal(9,2)) [Unit cost ΔPY% (pct)],
       -- the measure returns 0 when the change rounds to 0.0 pp, so labels never read -0.0 pp
       CAST(CASE WHEN ROUND(100 * ((s.AC - s.C1) / s.AC - (s.PY - s.C0) / s.PY), 1) = 0 THEN 0
                 ELSE 100 * ((s.AC - s.C1) / s.AC - (s.PY - s.C0) / s.PY) END AS decimal(9,2)) [Margin% ΔPY (pp)]
FROM s JOIN b ON s.Category = b.Category OR (s.Category IS NULL AND b.Category IS NULL)
ORDER BY CASE WHEN s.Category IS NULL THEN 1 ELSE 0 END, s.Category;
GO

-- T11 Page headlines 2025: the expected text, built from the same numbers with the wording the data calls for
WITH a AS (    -- AC, PY and units by channel, country, category and half year
    SELECT CASE WHEN st.CountryCode = N'--' THEN N'Online' ELSE N'Stores' END Channel, st.CountryName Country,
           CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END CountryCode, p.CategoryKey, p.CategoryName Category,
           CASE WHEN MONTH(s.OrderDate) >= 7 THEN 2 ELSE 1 END Half,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity * s.NetPrice END) AS float) AC,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity * s.NetPrice END) AS float) PY,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity END) AS float) Q1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity END) AS float) Q0
    FROM Data.Sales s JOIN Data.Store st ON st.StoreKey = s.StoreKey JOIN Data.Product p ON p.ProductKey = s.ProductKey
    WHERE s.OrderDate >= '2024-01-01' AND s.OrderDate < '2026-01-01'
    GROUP BY CASE WHEN st.CountryCode = N'--' THEN N'Online' ELSE N'Stores' END, st.CountryName,
             CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END, p.CategoryKey, p.CategoryName,
             CASE WHEN MONTH(s.OrderDate) >= 7 THEN 2 ELSE 1 END
), pl AS (     -- BU and FC by country, category and half year
    SELECT CountryCode, CategoryKey, CASE WHEN YearMonthKey % 100 >= 7 THEN 2 ELSE 1 END Half,
           CAST(SUM(CASE WHEN Scenario = N'BU' THEN SalesAmountUSD END) AS float) BU,
           CAST(SUM(CASE WHEN Scenario = N'FC' THEN SalesAmountUSD END) AS float) FC
    FROM model.PlanSales GROUP BY CountryCode, CategoryKey, CASE WHEN YearMonthKey % 100 >= 7 THEN 2 ELSE 1 END
), x AS (
    SELECT a.*, pl.BU, pl.FC FROM a JOIN pl ON pl.CountryCode = a.CountryCode AND pl.CategoryKey = a.CategoryKey AND pl.Half = a.Half
), t AS (
    SELECT SUM(AC) AC, SUM(PY) PY, SUM(BU) BU, SUM(FC) FC,
           SUM(CASE WHEN Half = 2 THEN AC END) AC2, SUM(CASE WHEN Half = 2 THEN PY END) PY2, SUM(CASE WHEN Half = 2 THEN FC END) FC2
    FROM x
), ch AS (
    SELECT Channel, SUM(AC) AC, SUM(PY) PY, SUM(BU) BU, SUM(FC) FC FROM x GROUP BY Channel
), ca AS (
    SELECT Category, SUM(AC) AC, SUM(BU) BU, SUM(Q1) Q1, SUM(Q0) Q0 FROM x GROUP BY Category
), co AS (
    SELECT CASE WHEN Country IN (N'United States', N'United Kingdom', N'Netherlands') THEN N'the ' + Country ELSE Country END Country,
           SUM(AC) - SUM(BU) D, ROW_NUMBER() OVER (ORDER BY SUM(AC) - SUM(BU)) r
    FROM x GROUP BY Country
), mp AS (    -- product grain for the margin bridge
    SELECT s.ProductKey,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity END) AS float) Q1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity END) AS float) Q0,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity * s.NetPrice END) AS float) N1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity * s.NetPrice END) AS float) N0,
           CAST(SUM(CASE WHEN s.OrderDate >= '2025-01-01' THEN s.Quantity * s.UnitCost END) AS float) C1,
           CAST(SUM(CASE WHEN s.OrderDate <  '2025-01-01' THEN s.Quantity * s.UnitCost END) AS float) C0
    FROM Data.Sales s WHERE s.OrderDate >= '2024-01-01' AND s.OrderDate < '2026-01-01' GROUP BY s.ProductKey
), m AS (
    SELECT (SUM(N1) - SUM(C1)) - (SUM(N0) - SUM(C0)) dGM,
           (SUM(Q1) - SUM(Q0)) * (SUM(N0) - SUM(C0)) / SUM(Q0) Vol,
           SUM(CASE WHEN Q0 > 0 AND Q1 > 0 THEN N1 - Q1 * N0 / Q0 END) Price,
           -SUM(CASE WHEN Q0 > 0 AND Q1 > 0 THEN C1 - Q1 * C0 / Q0 END) Cost,
           (SUM(N1) - SUM(C1)) / SUM(N1) Rate, (SUM(N0) - SUM(C0)) / SUM(N0) RatePY
    FROM mp
), mm AS (
    SELECT m.*, dGM - Vol - Price - Cost Mix,
           CONCAT(N'product mix cost $', FORMAT(ABS(dGM - Vol - Price - Cost) / 1e6, '0.0'), N'M and lower volume cost $', FORMAT(ABS(Vol) / 1e6, '0.0'),
                  N'M, while prices and unit costs held') Drivers
    FROM m
)
SELECT 1 [#], N'Overview, BU' [Case],
       CONCAT(N'Sales are ', FORMAT(ABS(t.AC / t.BU - 1), '0.0%'), N' below budget and ', FORMAT(ABS(t.AC / t.PY - 1), '0.0%'), N' below last year; ',
              c.Channel, N' sales carry ', FORMAT((c.AC - c.BU) / (t.AC - t.BU), '0%'), N' of the $', FORMAT(ABS(t.AC - t.BU) / 1e6, '0.0'), N'M gap') Expected
FROM t CROSS APPLY (SELECT TOP 1 * FROM ch ORDER BY AC - BU) c
UNION ALL
SELECT 2, N'Overview, PY',
       CONCAT(N'Sales are ', FORMAT(ABS(t.AC / t.PY - 1), '0.0%'), N' below last year and ', FORMAT(ABS(t.AC / t.BU - 1), '0.0%'), N' below budget; ',
              c.Channel, N' sales are $', FORMAT(ABS(c.AC - c.PY) / 1e6, '0.0'), N'M below last year, more than the whole $', FORMAT(ABS(t.AC - t.PY) / 1e6, '0.0'), N'M gap')
FROM t CROSS APPLY (SELECT TOP 1 * FROM ch ORDER BY AC - PY) c
UNION ALL
SELECT 3, N'Overview, FC',
       CONCAT(N'Sales are ', FORMAT(ABS(t.AC / t.FC - 1), '0.0%'), N' above forecast but ', FORMAT(ABS(t.AC / t.PY - 1), '0.0%'), N' below last year; ',
              IIF(c.Channel = N'Stores', N'Store', c.Channel), N' sales are $', FORMAT((c.AC - c.FC) / 1e6, '0.0'), N'M above forecast, more than the whole $', FORMAT((t.AC - t.FC) / 1e6, '0.0'), N'M lead')
FROM t CROSS APPLY (SELECT TOP 1 * FROM ch ORDER BY AC - FC DESC) c
UNION ALL
SELECT 4, N'Channels, BU',
       CONCAT(c.Channel, N' accounts for ', FORMAT((c.AC - c.BU) / (t.AC - t.BU), '0%'), N' of the $', FORMAT(ABS(t.AC - t.BU) / 1e6, '0.0'), N'M gap to budget and is ',
              FORMAT(ABS(c.AC / c.PY - 1), '0.0%'), N' below last year')
FROM t CROSS APPLY (SELECT TOP 1 * FROM ch ORDER BY AC - BU) c
UNION ALL
SELECT 5, N'Channels, PY',
       CONCAT(c.Channel, N' is $', FORMAT(ABS(c.AC - c.PY) / 1e6, '0.0'), N'M below last year, more than the whole $', FORMAT(ABS(t.AC - t.PY) / 1e6, '0.0'), N'M gap, and ',
              FORMAT(ABS(c.AC / c.BU - 1), '0.0%'), N' below budget')
FROM t CROSS APPLY (SELECT TOP 1 * FROM ch ORDER BY AC - PY) c
UNION ALL
SELECT 6, N'Channels, FC',
       CONCAT(c.Channel, N' are $', FORMAT((c.AC - c.FC) / 1e6, '0.0'), N'M above forecast, more than the whole $', FORMAT((t.AC - t.FC) / 1e6, '0.0'), N'M lead, and ',
              FORMAT(ABS(c.AC / c.PY - 1), '0.0%'), N' above last year')
FROM t CROSS APPLY (SELECT TOP 1 * FROM ch ORDER BY AC - FC DESC) c
UNION ALL
SELECT 7, N'Products, BU',
       CONCAT(N'$', FORMAT(ABS(c.AC - c.BU) / 1e6, '0.0'), N'M of the $', FORMAT(ABS(t.AC - t.BU) / 1e6, '0.0'), N'M gap to budget comes from ', c.Category,
              N', where units are ', FORMAT(ABS(c.Q1 / c.Q0 - 1), '0.0%'), IIF(c.Q1 < c.Q0, N' below', N' above'), N' last year')
FROM t CROSS APPLY (SELECT TOP 1 * FROM ca ORDER BY AC - BU) c
UNION ALL
SELECT 8, N'Regions, BU',
       CONCAT(UPPER(LEFT(c1.Country, 1)) + SUBSTRING(c1.Country, 2, 100), N' and ', c2.Country, N' are $', FORMAT(ABS(c1.D + c2.D) / 1e6, '0.0'), N'M below budget; the other ',
              (SELECT COUNT(*) FROM co) - 2, N' are $', FORMAT(ABS(t.AC - t.BU - c1.D - c2.D) / 1e6, '0.0'), IIF(t.AC - t.BU - c1.D - c2.D < 0, N'M behind', N'M ahead'))
FROM t CROSS JOIN co c1 CROSS JOIN co c2 WHERE c1.r = 1 AND c2.r = 2
UNION ALL
SELECT 9, N'Margin, BU',
       CONCAT(N'No margin budget; compared with last year, margin is $', FORMAT(ABS(dGM) / 1e6, '0.0'), N'M lower: ', Drivers)
FROM mm
UNION ALL
SELECT 10, N'Margin, PY',
       CONCAT(N'Margin is $', FORMAT(ABS(dGM) / 1e6, '0.0'), N'M below last year: ', Drivers, N'; the rate rose ', FORMAT(ABS(Rate - RatePY) * 100, '0.0'), N' pp to ', FORMAT(Rate, '0.0%'))
FROM mm
UNION ALL
SELECT 11, N'Outlook, BU',
       CONCAT(N'The June forecast expected H2 ', FORMAT(ABS(t.FC2 / t.PY2 - 1), '0.0%'), N' below last year; H2 closed ', FORMAT(ABS(t.AC2 / t.PY2 - 1), '0.0%'),
              N' above, $', FORMAT(ABS(t.AC2 - t.FC2) / 1e6, '0.0'), N'M better, and the year ', FORMAT(ABS(t.AC / t.BU - 1), '0.0%'), N' below budget')
FROM t
UNION ALL SELECT 12, N'Focus channel, BU', (SELECT TOP 1 Channel FROM ch ORDER BY AC - BU)
UNION ALL SELECT 13, N'Focus channel, PY', (SELECT TOP 1 Channel FROM ch ORDER BY AC - PY)
UNION ALL SELECT 14, N'Focus channel, FC', (SELECT TOP 1 Channel FROM ch ORDER BY AC - FC DESC)
ORDER BY 1;
GO

-- T12 Margin rate in December 2025 (AC) and December 2024 (PY); every other month is blank in the DAX test
SELECT YEAR(OrderDate) Yr,
       CAST(100 * (SUM(Quantity * NetPrice) - SUM(Quantity * UnitCost)) / SUM(Quantity * NetPrice) AS decimal(9,4)) [GrossMargin% Dec (pct)]
FROM Data.Sales
WHERE MONTH(OrderDate) = 12 AND OrderDate >= '2024-01-01' AND OrderDate < '2026-01-01'
GROUP BY YEAR(OrderDate) ORDER BY 1 DESC;
GO
