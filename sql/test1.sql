

ALTER TABLE  [SalesLT].[Customer]
ADD Test1 varchar(255);

Update [SalesLT].[Customer]
Set Test1 = 'ray'
WHERE CustomerID = 1;

select Test1 from [SalesLT].[Customer]
WHERE CustomerID = 1;
