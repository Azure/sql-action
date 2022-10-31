# Azure SQL Deploy

This repository contains the sql-action GitHub Action for deploying changes to Azure SQL or SQL Server in a dacpac, SQL scripts, or an SDK-style SQL project. With the Azure SQL Action for GitHub, you can automate your workflow to deploy updates to Azure SQL or SQL Server.

Get started today with a [free Azure account](https://azure.com/free/open-source)!

## 🚀 Usage

The definition of this GitHub Action is in [action.yml](https://github.com/Azure/sql-action/blob/master/action.yml).  Learn more in the [user guide](#📓-user-guide).

```yaml
- uses: azure/sql-action@v2
  with:
    # required, connection string incl the database and user authentication information
    connection-string:

    # required, path to either a .sql, .dacpac, or .sqlproj file
    path:

    # optional when using a .sql script, required otherwise
    # sqlpackage action on the .dacpac or .sqlproj file, supported options are: Publish, Script, DeployReport, DriftReport
    action:

    # optional additional sqlpackage or go-sqlcmd arguments
    arguments:

    # optional additional dotnet build options when building a database project file
    build-arguments:
```

## 🎨 Samples

### Build and deploy a SQL project

> **Note:** The database project must use the [Microsoft.Build.Sql](https://www.nuget.org/packages/microsoft.build.sql/) SDK.

```yaml
# .github/workflows/sql-deploy.yml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v1
    - uses: azure/sql-action@v2
      with:        
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        path: './Database.sqlproj'
        action: 'publish'
        build-arguments: '-c Release'                 # Optional build options passed to dotnet build
        arguments: '/p:DropObjectsNotInSource=true'   # Optional properties and parameters for SqlPackage Publish
```

### Deploy SQL scripts to an Azure SQL Database with a temporary firewall rule

```yaml
# .github/workflows/sql-deploy.yml
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v1
    - uses: azure/login@v1                            # Azure login required to add a temporary firewall rule
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}
    - uses: azure/sql-action@v2
      with:        
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        path: './sqlscripts/*.sql'
```

### Deploy a DACPAC to an Azure SQL database with Allow Azure Services access enabled

```yaml
# .github/workflows/sql-deploy.yml
on: [push]

jobs:
  build:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v1
    - uses: azure/sql-action@v2
      with:
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        path: './Database.dacpac'
        action: 'publish'
        arguments: '/p:DropObjectsNotInSource=true'   # Optional properties parameters for SqlPackage Publish
```


## 📓 User Guide

### Authentication and Connection String

The v1.x version of sql-action supports SQL authentication only in the connection string. Starting in v2, AAD Password, AAD Service Principal, and AAD Default authentications are also supported.

The basic format of a connection string includes a series of keyword/value pairs separated by semicolons. The equal sign (=) connects each keyword and its value. (Ex: Key1=Val1;Key2=Val2)  An example connection string template is: `Server=<servername>; User ID=<user_id>; Password=<password>; Initial Catalog=<database>`.

The following rules are to be followed while passing special characters in values:
1. To include values that contain a semicolon, single-quote character, or double-quote character, the value must be enclosed in double quotation marks. 
2. If the value contains both a semicolon and a double-quote character, the value can be enclosed in single quotation marks. 
3. The single quotation mark is also useful if the value starts with a double-quote character. Conversely, the double quotation mark can be used if the value starts with a single quotation mark. 
4. If the value contains both single-quote and double-quote characters, the quotation mark character used to enclose the value must be doubled every time it occurs within the value.
        

For more information about connection strings, see <https://aka.ms/sqlconnectionstring>.

### Arguments

sql-action supports passing arguments to SqlPackage, go-sqlcmd, and dotnet build.
- **SqlPackage**: SqlPackage publish properties are passed to the SqlPackage utility from the `arguments` property. More information on these properties is available in the [SqlPackage publish](https://docs.microsoft.com/sql/tools/sqlpackage/sqlpackage-publish#properties-specific-to-the-publish-action) documentation. SqlPackage [parameters](https://docs.microsoft.com/sql/tools/sqlpackage/sqlpackage-publish#parameters-for-the-publish-action) that do not impact the source or target setting are also valid, including `/Profile:` for a publish profile, `/DeployReportPath:` for a deployment report, and `/Variables:` to set SQLCMD variable values.
- **go-sqlcmd**: go-sqlcmd parameters are passed to the go-sqlcmd utility from the `arguments` property. This enables SQLCMD variables `-v` to be passed  to scripts as seen in the [sqlcmd documentation](https://docs.microsoft.com/sql/tools/sqlcmd-utility#syntax).
- **dotnet build**: dotnet build options are passed to the SQL project build step from the `build-arguments` property. More information on options is available in the [dotnet build documentation](https://docs.microsoft.com/dotnet/core/tools/dotnet-build#options).

### Environments

sql-action is supported on both Windows and Linux environments.  The [default images](https://github.com/actions/virtual-environments) include the prerequisites:

- sqlpackage (for sqlproj or dacpac deployment)
- dotnet (for sqlproj build)

### Firewall Rules/Access

If you *can* use the option [Allow Azure Services and resources to access this server](https://docs.microsoft.com/en-us/azure/azure-sql/database/firewall-configure#connections-from-inside-azure), you are all set and you don't need to to anything else to allow GitHub Action to connect to your Azure SQL database.

If you *cannot* use the aforementioned option, the action can automatically add and remove a [SQL server firewall rule](https://docs.microsoft.com/azure/sql-database/sql-database-server-level-firewall-rule) specific to the GitHub Action runner's IP address. Without the firewall rule, the runner cannot communicate with Azure SQL Database. **To enable the action to automatically add/remove a firewall rule, add an [`Azure/login`](https://github.com/Azure/login) step before the `sql-action` step.** Also, the service principal used in the Azure login action needs to have elevated permissions, i.e. membership in SQL Security Manager RBAC role, or a similarly high permission in the database to create the firewall rule.

Potential errors:
- If the Azure/login action is not included, then the sql action would fail with a firewall exception and appropriate messaging.
- Alternatively, if enough permissions are not granted on the service principal or login action is not included, then the firewall rules have to be explicitly managed by user using CLI/PS scripts.


Azure SQL Action for GitHub is supported for the Azure public cloud as well as Azure government clouds ('AzureUSGovernment' or 'AzureChinaCloud'). Before running this action, login to the respective Azure Cloud  using [Azure Login](https://github.com/Azure/login) by setting appropriate value for the `environment` parameter.

#### Azure Credentials for Login

If you need to configure Azure Credentials to automatically manage firewall rules, you need to create a Service Principal, and store the related credentials into a GitHub Secret so that it can be used by the Azure Login actions to authenticate and authorize any subsequent request.

Paste the output of the below [az cli](https://learn.microsoft.com/cli/azure/?view=azure-cli-latest) command as the value of secret variable, for example `AZURE_CREDENTIALS`.

```bash
az ad sp create-for-rbac --role contributor --sdk-auth --name "sqldeployserviceprincipal" \
  --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group}
```
Replace {subscription-id}, {resource-group} with the subscription ID and resource group of the Azure SQL server

The command should output a JSON object similar to this:

```json
{
  "clientId": "<GUID>",
  "clientSecret": "<GUID>",
  "subscriptionId": "<GUID>",
  "tenantId": "<GUID>",
  // ...
} 
```

### Secrets

All the above examples use `{{secrets.AZURE_SQL}}` syntax for sensitive information, where content such as connection strings are stored in GitHub secrets. To create [secrets](https://help.github.com/en/github/automating-your-workflow-with-github-actions/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) in GitHub, navigate within your repository to **Settings** and then **Secrets**. Be careful to check the connection string which you copy from Azure SQL as the connection string has this **Password={your_password}** and you will need to supply the correct password for your connection string.

## 📦 End-to-End Examples

### Create Azure SQL Database + SQL Projects

1. Follow the tutorial [Azure SQL Quickstart to create a single database](https://docs.microsoft.com/azure/azure-sql/database/single-database-create-quickstart?tabs=azure-portal#create-a-single-database)
2. Copy the below template and paste the contents in `.github/workflows/` in your project repository as `sql-workflow.yml`.

  ```yaml
  # .github/workflows/sql-workflow.yml
  on: [push]
  
  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
      - uses: actions/checkout@v1
      - uses: azure/sql-action@v2
        with:        
          connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
          path: './Database.sqlproj'
          action: 'publish'
  ```

3. Place the connection string from the Azure Portal in GitHub secrets as `AZURE_SQL_CONNECTION_STRING`. Connection string format is: `Server=<server.database.windows.net>;User ID=<user>;Password=<password>;Initial Catalog=<database>`.
4. Copy the below SQL project template and paste the content in your project repository as `Database.sqlproj`.

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

5. Place any additional SQL object definitions in the project folder or in subfolders.  An example table to get you started is:

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

6. Commit and push your project to GitHub repository, you should see a new GitHub Action initiated in **Actions** tab.
7. For further use of SQL projects in VS Code and Azure Data Studio, check out [http://aka.ms/azuredatastudio-sqlprojects](http://aka.ms/azuredatastudio-sqlprojects) for more information.

### Create Azure SQL Database + Deploy Existing Schema (dacpac)

1. Create a dacpac from an existing SQL database with either [SSMS](https://docs.microsoft.com/sql/relational-databases/data-tier-applications/extract-a-dac-from-a-database), [Azure Data Studio](https://docs.microsoft.com/sql/azure-data-studio/extensions/sql-server-dacpac-extension) or [SqlPackage CLI](https://docs.microsoft.com/sql/tools/sqlpackage/sqlpackage-extract).  Place the dacpac file at the root of your repository.
2. Follow the tutorial [Azure SQL Quickstart to create a single database](https://docs.microsoft.com/azure/azure-sql/database/single-database-create-quickstart?tabs=azure-portal#create-a-single-database)
3. Copy the below template and paste the contents in `.github/workflows/` in your project repository as `sql-workflow.yml`, changing the dacpac file name as appropriate.

  ```yaml
  # .github/workflows/sql-workflow.yml
  on: [push]
  
  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
      - uses: actions/checkout@v1
      - uses: azure/sql-action@v2
        with:        
          connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
          path: './PreviousDatabase.dacpac'
          action: 'publish'
  ```

4. Place the connection string from the Azure Portal in GitHub secrets as `AZURE_SQL_CONNECTION_STRING`. Connection string format is: `Server=<server.database.windows.net>;User ID=<user>;Password=<password>;Initial Catalog=<database>`.
5. Commit and push your project to GitHub repository, you should see a new GitHub Action initiated in **Actions** tab.

## ✏️ Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g. status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
