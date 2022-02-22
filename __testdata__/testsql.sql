-- This script is used by pr-check.yml to test the SQLCMD action

-- This should successfully insert data into the table created in the DACPAC step
INSERT INTO [Table1] VALUES(1, 'test');

-- This should successfully SELECT from the view created by the sqlproj
SELECT * FROM [View1];