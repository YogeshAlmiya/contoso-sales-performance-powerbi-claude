/*
    Dimensions for the Contoso Sales semantic model (Import).
    Run: uv run tools/sql.py -f sql/model_dims.sql
*/

-- Date: whole years 2016-2025 (the sales history), integer keys for relationships
CREATE OR ALTER VIEW model.DimDate AS
SELECT CAST(YEAR(d.Date) * 10000 + MONTH(d.Date) * 100 + DAY(d.Date) AS int) DateKey,
       d.Date,
       d.Year,
       CAST(d.Quarter AS nvarchar(2)) Quarter,
       CAST(CONCAT(d.Year, N' ', d.Quarter) AS nvarchar(7)) YearQuarter,             -- 2025 Q1
       CAST(d.Year * 10 + DATEPART(QUARTER, d.Date) AS int) YearQuarterKey,          -- 20251
       CAST(d.MonthShort AS nvarchar(3)) Month,                                      -- Jan
       d.MonthNumber,
       CAST(d.YearMonthShort AS nvarchar(8)) YearMonth,                              -- Jan 2025
       CAST(d.Year * 100 + d.MonthNumber AS int) YearMonthKey,                       -- 202501
       CAST(d.DayofWeekShort AS nvarchar(3)) DayOfWeek,                              -- Mon
       d.DayofWeekNumber DayOfWeekNumber,
       CAST(CASE WHEN d.WorkingDay = 1 THEN N'Yes' ELSE N'No' END AS nvarchar(3)) WorkingDay
FROM Data.Date d
WHERE d.Date >= '2016-01-01' AND d.Date < '2026-01-01';
GO

-- Product: only the attributes the report needs; CategoryKey joins the plan
CREATE OR ALTER VIEW model.DimProduct AS
SELECT p.ProductKey,
       p.ProductName,
       p.Brand,
       p.SubCategoryName Subcategory,
       p.CategoryName Category,
       p.CategoryKey
FROM Data.Product p;
GO

/*
    Store: the online store's CountryCode '--' becomes 'ONL' (CountryName 'Online'),
    the code the plan uses, so actuals and plan join on country.
    Blank Status: 'Closed' when CloseDate is on or before 2025-12-31, otherwise 'Open'.
*/
CREATE OR ALTER VIEW model.DimStore AS
SELECT st.StoreKey,
       CAST(CASE WHEN st.StoreKey = 999999 THEN N'Online store' ELSE st.Description END AS nvarchar(100)) StoreName,
       st.State,
       CAST(CASE WHEN st.CountryCode = N'--' THEN N'ONL' ELSE st.CountryCode END AS nvarchar(3)) CountryCode,
       st.CountryName,
       CAST(CASE WHEN st.CountryCode = N'--' THEN N'Online' ELSE N'Stores' END AS nvarchar(6)) Channel,
       CAST(CASE
                WHEN NULLIF(st.Status, N'') IS NOT NULL THEN st.Status
                WHEN st.CloseDate <= '2025-12-31' THEN N'Closed'
                ELSE N'Open'
            END AS nvarchar(20)) Status
FROM Data.Store st;
GO
