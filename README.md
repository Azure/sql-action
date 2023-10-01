# Azure SQL Deploy

Azure SQL Deploy is a GitHub Action designed to simplify the deployment of changes to Azure SQL or SQL Server databases using DACPACs, SQL scripts, or SDK-style SQL projects. With Azure SQL Deploy, users can automate workflows to streamline database updates for both Azure SQL and SQL Server.

Start today with a [free Azure account](https://azure.com/free/open-source)!

If you prefer to develop with SQL locally and offline before deploying with GitHub, consider using the [Azure SQL local emulator](https://aka.ms/azuredbemulator) and [SQL Server Developer Edition](https://www.microsoft.com/sql-server/sql-server-downloads).

## 🚀 Usage

To integrate this GitHub Action, specify it in your workflow YAML file as depicted below. For more comprehensive insights, refer to the [user guide](#📓-user-guide).

```yaml
- name: Deploy to Azure SQL
  uses: Azure/sql-action@v2.2
  with:
    # Required: Connection string including database and user authentication information
    connection-string:
    
    # Required: Path to either a .sql, .dacpac, or .sqlproj file
    path:
    
    # Optional when using a .sql script, mandatory otherwise
    # Supported actions on the .dacpac or .sqlproj file: Publish, Script, DeployReport, DriftReport
    action:
    
    # Optional additional SQL package or go-sqlcmd arguments
    arguments:
    
    # Optional additional .NET build options when building a database project file
    build-arguments:
```

## 🎨 Samples

### Build and Deploy a SQL Project

> **Note:** The database project must incorporate the [Microsoft.Build.Sql](https://www.nuget.org/packages/microsoft.build.sql/) SDK.

```yaml
# .github/workflows/sql-deploy.yml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: azure/sql-action@v2.2
      with:        
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        path: './Database.sqlproj'
        action: 'publish'
        build-arguments: '-c Release'                 # Optional build options passed to dotnet build
        arguments: '/p:DropObjectsNotInSource=true'   # Optional properties and parameters for SqlPackage Publish
```

### Deploy SQL Scripts to an Azure SQL Database with a Temporary Firewall Rule

```yaml
# .github/workflows/sql-deploy.yml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: azure/login@v1                            # Azure login required to add a temporary firewall rule
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}
    - uses: azure/sql-action@v2.2
      with:        
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        path: './sqlscripts/*.sql'
```

### Deploy a DACPAC to an Azure SQL Database with Allow Azure Services Access Enabled

```yaml
# .github/workflows/sql-deploy.yml
on: [push]

jobs:
  build:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v3
    - uses: azure/sql-action@v2.2
      with:
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        path: './Database.dacpac'
        action: 'publish'
        arguments: '/p:DropObjectsNotInSource=true'   # Optional properties parameters for SqlPackage Publish
```


## 📓 User Guide

### Authentication and Connection String

The v1.x version of sql-action supports SQL authentication only in the connection string. Starting in v2, AAD Password, AAD Service Principal, and AAD Default authentications are also supported. **Learn more about implementing sql-action with various authentication methods in the [connection](CONNECTION.md) guide.**

### Arguments

sql-action enables passing arguments to SqlPackage, go-sqlcmd, and dotnet build.
- **SqlPackage**: SqlPackage publish properties are conveyed to the SqlPackage utility from the `arguments` property. Additional details on these properties can be found in the [SqlPackage publish](https://docs.microsoft.com/sql/tools/sqlpackage/sqlpackage-publish#properties-specific-to-the-publish-action) documentation. SqlPackage [parameters](https://docs.microsoft.com/sql/tools/sqlpackage/sqlpackage-publish#parameters-for-the-publish-action) that do not affect the source or target setting are also acceptable, including `/Profile:` for a publish profile, `/DeployReportPath:` for a deployment report, and `/Variables:` to set SQLCMD variable values.
- **go-sqlcmd**: go-sqlcmd parameters are conveyed to the go-sqlcmd utility from the `arguments` property. This enables SQLCMD variables `-v` to be passed to scripts as described in the [sqlcmd documentation](https://docs.microsoft.com/sql/tools/sqlcmd-utility#syntax).
- **dotnet build**: dotnet build options are conveyed to the SQL project build step from the `build-arguments` property. Additional details on options can be found in the [dotnet build documentation](https://docs.microsoft.com/dotnet/core/tools/dotnet-build#options).

### Environments

sql-action is compatible with both Windows and Linux environments. The [default images](https://github.com/actions/virtual-environments) are equipped with the prerequisites:
- sqlpackage (for sqlproj or dacpac deployment)
- dotnet (for sqlproj build)

### Firewall Rules/Access

If leveraging the option [Allow Azure Services and resources to access this server](https://docs.microsoft.com/en-us/azure/azure-sql/database/firewall-configure#connections-from-inside-azure) is feasible, no additional actions are required to enable GitHub Action to connect to your Azure SQL database.

If the aforementioned option is not viable, the action can autonomously add and remove a [SQL server firewall rule](https://docs.microsoft.com/azure/sql-database/sql-database-server-level-firewall-rule) specific to the GitHub Action runner's IP address. Without this firewall rule, the runner is unable to communicate with the Azure SQL Database. Further information is available in the [connection](CONNECTION.md) guide.


#### Azure Credentials for Login (Quickstart)

**To empower the action to autonomously add/remove a firewall rule, incorporate an [`Azure/login`](https://github.com/Azure/login) step before the `sql-action` step.** Additionally, the service principal utilized in the Azure login action should possess elevated permissions, e.g. membership in the SQL Security Manager RBAC role, or a similarly high permission in the database to create the firewall rule. Explore more about this and other authentication methods in the [connection](CONNECTION.md) guide.

Execute the following [az cli](https://docs.microsoft.com/cli/azure/?view=azure-cli-latest) command and paste the output as the value of the secret variable, for example, `AZURE_CREDENTIALS`.

```bash
az ad sp create-for-rbac --role contributor --sdk-auth --name "sqldeployserviceprincipal" \
  --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group}
```
Substitute {subscription-id}, {resource-group} with the subscription ID and resource group of the Azure SQL server.

The command should output a JSON object similar to this:

```
{
  "clientId": "<GUID>",
  "clientSecret": "<GUID>",
  "subscriptionId": "<GUID>",
  "tenantId": "<GUID>",
  // ...
} 
```

### Secrets

In all the provided examples, the `{{secrets.AZURE_SQL}}` syntax is used for sensitive information, where content such as connection strings is stored in GitHub secrets. To create [secrets](https://help.github.com/en/github/automating-your-workflow-with-github-actions/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) in GitHub, navigate within your repository to **Settings** and then **Secrets**. When copying the connection string from Azure SQL, verify it as the connection string contains **Password={your_password}**, and you will need to supply the correct password for your connection string.


## 📦 End-to-End Examples

### Create Azure SQL Database + SQL Projects

1. Follow the tutorial [Azure SQL Quickstart to create a single database](https://docs.microsoft.com/azure/azure-sql/database/single-database-create-quickstart?tabs=azure-portal#create-a-single-database)
2. Copy the template below and paste the contents in `.github/workflows/` in your project repository as `sql-workflow.yml`.
```yaml
# .github/workflows/sql-workflow.yml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: azure/sql-action@v2.2
      with:        
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        path: './Database.sqlproj'
        action: 'publish'
```
3. Store the connection string from the Azure Portal in GitHub secrets as `AZURE_SQL_CONNECTION_STRING`. The connection string format is: `Server=<server.database.windows.net>;User ID=<user>;Password=<password>;Initial Catalog=<database>`.
4. Copy the SQL project template below and paste the content in your project repository as `Database.sqlproj`.
```xml
<?xml version="1.0" encoding="utf-8"?>
<Project DefaultTargets="Build">
  <Sdk Name="Microsoft.Build.Sql" Version="0.1.3-preview" />
  <PropertyGroup>
    <Name>reactions</Name>
    <DSP>Microsoft.Data.Tools.Schema.Sql.SqlAzureV12DatabaseSchemaProvider</DSP>
    <ModelCollation>1033, CI</ModelCollation>
  </PropertyGroup>
</Project>
```
5. Place any additional SQL object definitions in the project folder or in subfolders. Here is an example table to get you started:
```sql
CREATE TABLE [dbo].[Product](
	[ProductID] [int] IDENTITY(1,1) PRIMARY KEY NOT NULL,
	[Name] [nvarchar](100) NOT NULL,
	[ProductNumber] [nvarchar](25) NOT NULL,
	[Color] [nvarchar](15) NULL,
	[StandardCost] [money] NOT NULL,
	[ListPrice] [money] NOT NULL,
	[Size] [nvarchar](5) NULL,
	[Weight] [decimal](8, 2) NULL,
	[ProductCategoryID] [int] NULL,
	[ProductModelID] [int] NULL,
	[ModifiedDate] [datetime] NOT NULL
)
```
6. Commit and push your project to the GitHub repository; you should then see a new GitHub Action initiated in the **Actions** tab.
7. For further exploration of SQL projects in VS Code and Azure Data Studio, refer to [http://aka.ms/azuredatastudio-sqlprojects](http://aka.ms/azuredatastudio-sqlprojects).


### Create Azure SQL Database + Deploy Existing Schema (dacpac)

1. Create a dacpac from an existing SQL database using either [SSMS](https://docs.microsoft.com/sql/relational-databases/data-tier-applications/extract-a-dac-from-a-database), [Azure Data Studio](https://docs.microsoft.com/sql/azure-data-studio/extensions/sql-server-dacpac-extension) or [SqlPackage CLI](https://docs.microsoft.com/sql/tools/sqlpackage/sqlpackage-extract). Place the dacpac file at the root of your repository.
2. Follow the tutorial [Azure SQL Quickstart to create a single database](https://docs.microsoft.com/azure/azure-sql/database/single-database-create-quickstart?tabs=azure-portal#create-a-single-database)
3. Copy the template below and paste the contents in `.github/workflows/’ in your project repository as `sql-workflow.yml`, modifying the dacpac file name as necessary.
```yaml
# .github/workflows/sql-workflow.yml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: azure/sql-action@v2.2
      with:        
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        path: './PreviousDatabase.dacpac'
        action: 'publish'
```
4. Store the connection string from the Azure Portal in GitHub secrets as `AZURE_SQL_CONNECTION_STRING`. The connection string format is: `Server=<server.database.windows.net>;User ID=<user>;Password=<password>;Initial Catalog=<database>`.
5. Commit and push your project to the GitHub repository; you should then see a new GitHub Action initiated in the **Actions** tab.


## ✏️ Contributing

For more information on contributing to this project, please see [Contributing](CONTRIBUTING.md).
