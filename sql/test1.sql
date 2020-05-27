ALTER TABLE [SalesLT].[Customer]
DROP COLUMN Test2;

ALTER TABLE  [SalesLT].[Customer]
ADD Test2 varchar(255);

Update [SalesLT].[Customer]
Set Test2 = 'ray'
WHERE CustomerID = 1;

select Test2 from [SalesLT].[Customer]
WHERE CustomerID = 1;
