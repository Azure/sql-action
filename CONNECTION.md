# sql-action connection guide

GitHub sql-action access is coupled with two concepts necessary for the action to connect to the database:

- 🔌 [Network connectivity](#-network-connectivity)
- 🔑 [Authentication](#-authentication)

# 🔌 Network connectivity

> [!TIP]
> This action checks if the runner is able to connect to the database before executing the scripts or deployment to determine whether a firewall rule should be added. In some environments this can cause the action to fail so the connectivity check can be skipped by setting the input `skip-firewall-check` to `true`.

## Azure SQL Database

If you *can* use the option [Allow Azure Services and resources to access this server](https://docs.microsoft.com/azure/azure-sql/database/firewall-configure#connections-from-inside-azure), you are all set and you don't need to to anything else to allow GitHub Action to connect to your Azure SQL database.

If you *cannot* use the aforementioned option, the action can automatically add and remove a [SQL server firewall rule](https://docs.microsoft.com/azure/sql-database/sql-database-server-level-firewall-rule) specific to the GitHub Action runner's IP address. Without the firewall rule, the runner cannot communicate with Azure SQL Database. **To enable the action to automatically add/remove a firewall rule, add an [`Azure/login`](https://github.com/Azure/login) step before the `sql-action` step.** Also, the service principal used in the Azure login action needs to have elevated permissions, i.e. membership in SQL Security Manager RBAC role, or a similarly high permission in the database to create the firewall rule.

A benefit of using the firewall rule is that it is scoped to the IP address of the runner. This means that the firewall rule is only active for the duration of the action. This is a security best practice because it limits the exposure of the database to only the IP address of the runner.

Examples of creating the Azure Active Directory users for managing the firewall rules:
- [Service principal](#create-a-service-principal)
- [Managed identity](#create-a-managed-identity)

### Azure government clouds
Azure SQL Action for GitHub is supported for the Azure public cloud as well as Azure government clouds ('AzureUSGovernment' or 'AzureChinaCloud'). Before running this action, login to the respective Azure Cloud  using [Azure Login](https://github.com/Azure/login) by setting appropriate value for the `environment` parameter.

### Potential errors
- If the Azure/login action is not included, then the sql action would fail with a firewall exception and appropriate messaging.
- Alternatively, if enough permissions are not granted on the service principal or login action is not included, then the firewall rules have to be explicitly managed by user using CLI/PS scripts.

## Azure SQL Managed Instance

GitHub sql-action requires that prior to running the action against Azure SQL Managed Instance, the workflow must have network access to the SQL instance. An overview of Azure SQL Managed Instance [networking](https://learn.microsoft.com/azure/azure-sql/managed-instance/connectivity-architecture-overview#high-level-connectivity-architecture) is available to assist in identifying the appropriate network access for your environment.

Note that the public endpoint for Azure SQL Managed Instance utilizes a non-standard port (`Server=<mi_name>.public.<dns_zone>.database.windows.net,3342;Initial Catalog=<database>;...`), which should be included in the connection string. Azure SQL Managed Instance Public Endpoint requires enabling specific traffic in the network security group, detailed in the [public endpoint documentation](https://learn.microsoft.com/azure/azure-sql/managed-instance/public-endpoint-configure).

For network architectures where public access is not available, [self-hosted runners](https://docs.github.com/actions/hosting-your-own-runners/about-self-hosted-runners) can be leveraged to connect to the private endpoints.

> [!IMPORTANT]
> A failure to connect to the Azure SQL Managed Instance will result in the action attempting to add a firewall rule as if the endpoint with Azure SQL Database, which will fail.  The action will then fail with an error message indicating that the firewall rule could not be added.  If the included error message does not provide enough context for you to further troubleshoot your connectivity, rerun the workflow with [debug logs enabled](https://docs.github.com/actions/managing-workflow-runs/enabling-debug-logging#enabling-runner-diagnostic-logging) to get more detailed logging.


## SQL Server

GitHub sql-action requires that prior to running the action against SQL Server, the workflow must have network access to the SQL instance. For network architectures where public access is not available, [self-hosted runners](https://docs.github.com/actions/hosting-your-own-runners/about-self-hosted-runners) can be leveraged.  The SQL Server instance may be hosted in Azure, other public clouds, or on-premises and connect to this action.

> [!IMPORTANT]
> A failure to connect to the Azure SQL Managed Instance will result in the action attempting to add a firewall rule as if the endpoint with Azure SQL Database, which will fail.  The action will then fail with an error message indicating that the firewall rule could not be added.  If the included error message does not provide enough context for you to further troubleshoot your connectivity, rerun the workflow with [debug logs enabled](https://docs.github.com/actions/managing-workflow-runs/enabling-debug-logging#enabling-runner-diagnostic-logging) to get more detailed logging.

# 🔑 Authentication

The basic format of a connection string includes a series of keyword/value pairs separated by semicolons. The equal sign (=) connects each keyword and its value. (Ex: Key1=Val1;Key2=Val2)  An example connection string template is: `Server=<servername>; User ID=<user_id>; Password=<password>; Initial Catalog=<database>`.

The following rules are to be followed while passing special characters in values:
1. To include values that contain a semicolon, single-quote character, or double-quote character, the value must be enclosed in double quotation marks. 
2. If the value contains both a semicolon and a double-quote character, the value can be enclosed in single quotation marks. 
3. The single quotation mark is also useful if the value starts with a double-quote character. Conversely, the double quotation mark can be used if the value starts with a single quotation mark. 
4. If the value contains both single-quote and double-quote characters, the quotation mark character used to enclose the value must be doubled every time it occurs within the value.

For more information about connection strings, see https://aka.ms/sqlconnectionstring

## SQL authentication

The most basic method of authentication is to use SQL authentication, requiring a username and password. The connection string for SQL authentication is:

```
Server=<servername>;Initial Catalog=<database>; User ID=<user_id>; Password=<password>; Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

## Azure Active Directory service principal authentication

To use Azure Active Directory service principal authentication with sql-action, you need to create a Service Principal, and store the related credentials into GitHub secrets so that it can be used by [azure/login](https://github.com/Azure/login#configure-a-service-principal-with-a-secret) action to authenticate prior to running sql-action. In scenarios where the workflow adds a temporary firewall rule for Azure SQL Database, the same service principal can be used for the firewall rule and to connect to the SQL instance.

### Create a service principal
Additional information on creating a service principal and connecting GitHub to Azure can be found at:
- https://github.com/Azure/login#configure-a-service-principal-with-a-secret
- https://learn.microsoft.com/azure/developer/github/connect-from-azure#use-the-azure-login-action-with-a-service-principal-secret


The below [az cli](https://docs.microsoft.com/cli/azure/?view=azure-cli-latest) command creates a service principal with the name `sqldeployserviceprincipal` and the "SQL Server Contributor" role scoped to the resource group of the Azure SQL Database.

```bash
az ad sp create-for-rbac --role "SQL Server Contributor" --sdk-auth --name "sqldeployserviceprincipal" \
  --scopes /subscriptions/<subscription-id>/resourceGroups/<resource-group>
```
Replace `<subscription-id>`, `<resource-group>` with the subscription ID and resource group of the Azure SQL Database.

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

The output of the command contains the fields `clientId`, `clientSecret`, `subscriptionId`, and `tenantId`, that can be used to authenticate with azure/login. Place each of those values into GitHub Secrets with the names `CLIENT_ID`, `CLIENT_SECRET`, `SUBSCRIPTION_ID`, and `TENANT_ID` respectively.

```yml
  - uses: Azure/login@v1
    with:
      creds: '{"clientId":"${{ secrets.CLIENT_ID }}","clientSecret":"${{ secrets.CLIENT_SECRET }}","subscriptionId":"${{ secrets.SUBSCRIPTION_ID }}","tenantId":"${{ secrets.TENANT_ID }}"}'
```

#### Security hardening
Instead of using the built-in role "[SQL Server Contributor](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#sql-server-contributor)", the use of a [custom role](https://learn.microsoft.com/en-us/azure/role-based-access-control/custom-roles) can futher restrict the permissions of the service principal used to update the firewall rules.

Custom role definition:
```
{
    "properties": {
        "roleName": "SQL Server Firewall Rules Contributor",
        "description": "Custom role to control Azure SQL Server firewall rules",
        "assignableScopes": [
            "<scope>"
        ],
        "permissions": [
            {
                "actions": [
                    "Microsoft.Sql/servers/firewallRules/write",
                    "Microsoft.Sql/servers/firewallRules/delete"
                ],
                "notActions": [],
                "dataActions": [],
                "notDataActions": []
            }
        ]
    }
}
```

### Add the service principal to Azure SQL

The service principal created in the previous section needs to be added to the Azure SQL as a user and granted the permissions necessary to carry out deployments. Authorizing database access varies depending on the type of Azure SQL instance, check the [documentation](https://learn.microsoft.com/en-us/azure/azure-sql/database/logins-create-manage?view=azuresql) for more information..

The following example demonstrates adding the service principal to Azure SQL Database and granted the `db_ddladmin` role, completed by running the following SQL commands against the Azure SQL Database from a tool such as [Azure Data Studio](https://docs.microsoft.com/sql/azure-data-studio/download-azure-data-studio) while logged in as an Azure Active Directory user.  Your deployments may require additional roles to be granted to the service principal.

```sql
CREATE USER [sqldeployserviceprincipal] FROM EXTERNAL PROVIDER;

ALTER ROLE [db_ddladmin]
ADD MEMBER [sqldeployserviceprincipal];
```

The connection string for Azure Active Directory service principal authentication is:

```
Server=<servername>;Initial Catalog=<database>;Authentication=Active Directory Service Principal; User ID=<user_id>; Password=<password>; Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

where `<user_id>` is the `clientId` of the service principal and `<password>` is the `clientSecret` of the service principal.

## Azure Active Directory managed identity authentication

To use Azure Active Directory managed identity authentication with sql-action, you need to create a managed identity which is a federated user assigned identity associated with a specific entity (e.g. branch, environment) of the GitHub repository. For information on creating a managed identity for use with GitHub actions, see:
- https://learn.microsoft.com/azure/active-directory/develop/workload-identity-federation-create-trust
- https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-azure

In scenarios where the workflow adds a temporary firewall rule for Azure SQL Database, the same managed identity can be used for the firewall rule and to connect to the SQL instance.

### Create a managed identity

In following the [documentation on identity federation](https://learn.microsoft.com/azure/active-directory/develop/workload-identity-federation-create-trust), you will establish an App Registration in Azure Active Directory and create a federated credential (managed identity) for a specific entity in GitHub. The federated identity and the app registration will be used to authenticate with Azure.

The following values are required for the azure/login action to authenticate with Azure using the managed identity:
- `AZURE_CLIENT_ID` the Application (client) ID
- `AZURE_TENANT_ID` the Directory (tenant) ID
- `AZURE_SUBSCRIPTION_ID` the subscription ID


```yml
on:
  push:
    branches: [ main ]

permissions:
      id-token: write
      contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: azure/login@v1
      with:
        client-id: ${{ secrets.AZURE_CLIENT_ID }} 
        tenant-id: ${{ secrets.AZURE_TENANT_ID }} 
        subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

### Add the managed identity to Azure SQL

The managed identity created in the previous section needs to be added to the Azure SQL as a user and granted the permissions necessary to carry out deployments. Authorizing database access varies depending on the type of Azure SQL instance, check the [documentation](https://learn.microsoft.com/en-us/azure/azure-sql/database/logins-create-manage?view=azuresql) for more information..

The following example demonstrates adding the managed identity to Azure SQL Database and granted the `db_ddladmin` role, where the managed identity was created in an App Registration named `sample-app-registration`. The example can be completed by running the following SQL commands against the Azure SQL Database from a tool such as [Azure Data Studio](https://docs.microsoft.com/sql/azure-data-studio/download-azure-data-studio) while logged in as an Azure Active Directory user.  Your deployments may require additional roles to be granted to the managed identity.

```sql
CREATE USER [sample-app-registration] FROM EXTERNAL PROVIDER;

ALTER ROLE [db_ddladmin]
ADD MEMBER [sample-app-registration];
```

The connection string for Azure Active Directory managed identity authentication is:

```
Server=<servername>;Initial Catalog=<database>;Authentication=Active Directory Default; Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

Note: no userid or password is required for managed identity authentication.