/*
    Actuals for the Contoso Sales semantic model (Import).
    Run: uv run tools/sql.py -f sql/model_sales.sql

    Grain: day x store x product. Order and customer columns are left out to keep the model lean.
    Amounts are USD: source prices are already USD, so no exchange rate is applied.
    Amounts are money (4 decimals) so Power Query reads them as Fixed Decimal; decimal(19,4) arrives as a floating-point number.
*/
CREATE OR ALTER VIEW model.FactSales AS
SELECT CAST(YEAR(s.OrderDate) * 10000 + MONTH(s.OrderDate) * 100 + DAY(s.OrderDate) AS int) DateKey,
       s.StoreKey,
       s.ProductKey,
       SUM(s.Quantity) Quantity,
       CAST(SUM(s.Quantity * s.NetPrice) AS money) NetSales,
       CAST(SUM(s.Quantity * s.UnitCost) AS money) CostAmount
FROM Data.Sales s
GROUP BY s.OrderDate, s.StoreKey, s.ProductKey;
GO
