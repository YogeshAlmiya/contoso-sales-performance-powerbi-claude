/*
    Report helper tables.
    Run: uv run tools/sql.py -f sql/model_report.sql

    Comparison: the scenarios AC can be compared with, for the report's "Compare with" slicer.
    It has no relationships; measures read the selected code (PY when nothing is selected).
*/

CREATE OR ALTER VIEW model.Comparison AS
SELECT Comparison, ComparisonName, SortOrder
FROM (VALUES
    (N'PY', N'Previous year', 1),
    (N'BU', N'Budget',        2),
    (N'FC', N'Forecast',      3)
) v (Comparison, ComparisonName, SortOrder);
GO

SELECT * FROM model.Comparison ORDER BY SortOrder;
GO
