# GitHub Action for deploying updates to Azure SQL database

With the Azure SQL Action for GitHub, you can automate your workflow to deploy updates to [Azure SQL database](https://azure.microsoft.com/en-in/services/sql-database/).

Get started today with a [free Azure account](https://azure.com/free/open-source)!

This repository contains GitHub Action for [Azure SQL](https://github.com/Azure/sql-action) to deploy . 

The action uses Connection string for authentication and DACPAC/SQL scripts to deploy to your SQL database.

If you are looking for more Github Actions to deploy code or a customized image into an Azure Webapp or a Kubernetes service, consider using [Azure Actions](https://github.com/Azure/actions).

The definition of this Github Action is in [action.yml](https://github.com/Azure/sql-action/blob/master/action.yml).

# End-to-End Sample Workflow

## Dependencies on other Github Actions
If *can* use the option [Allow Azure Services and resources to access this server](https://docs.microsoft.com/en-us/azure/azure-sql/database/firewall-configure#connections-from-inside-azure), you are all set and you don't need to to anything else to allow GitHub Action to connect to your Azure SQL database.

If you *cannot* use the aformentioned option, additional steps are needed. 

* Authenticate using [Azure Login](https://github.com/Azure/login)

In fact, for the action to run, the IP Address of the GitHub Action runner (automation agent) must be added to the 'Allowed IP Addresses' by setting [SQL server firewall rules](https://docs.microsoft.com/en-us/azure/sql-database/sql-database-server-level-firewall-rule) in Azure.  Without the firewall rules, the runner cannot communicate with Azure SQL Database.

By default, the action would auto-detect the IP Address of the runner to automatically add firewall exception rule. These firewall rules will be deleted after the action executes.

However, this auto-provisioning of firewall rules needs a pre-req that the workflow includes an `azure/login@v1` action before the `azure/sql-action@v1` Action. Also, the service principal used in the Azure logic action needs to have elevated permissions, i.e. membership in SQL Security Manager RBAC role, or a similarly high permission in the database to create the firewall rule.

If the login action is not included, then the sql action would fail with a firewall exception and appropriate messaging.

Alternatively, if enough permissions are not granted on the service principal or login action is not included, then the firewall rules have to be explicitly managed by user using CLI/PS scripts.

## Create SQL database and deploy using GitHub Actions
1. Follow the tutorial [Azure SQL Quickstart](https://docs.microsoft.com/en-in/azure/sql-database/sql-database-single-database-get-started?tabs=azure-portal)
2. Copy the [SQL-on-Azure.yml template](https://github.com/Azure/actions-workflow-samples) and paste the contents into `.github/workflows/` within your project repository as `workflow.yml`.
3. Change `server-name` to your Azure SQL Server name.
4. Commit and push your project to GitHub repository, you should see a new GitHub Action initiated in **Actions** tab.

## Configure GitHub Secrets 
For using any sensitive data/secrets like Azure Service Principal or SQL Connection strings within an Action, add them as [secrets](https://help.github.com/en/github/automating-your-workflow-with-github-actions/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) in the GitHub repository and then use them in the workflow.

Follow the steps to configure the secret:
  * Define a new secret under your repository **Settings** > **Secrets** > **Add a new secret** menu
  * Paste the contents of the Secret (Example: Connection String) as Value
  
If you need to configure Azure Credentials to automatically manage firewall rules, you need to create a Service Principal, and store the related credentials into a GitHub Secrect so that it can be used by the Azure Login actions to authenticate and authorize any subsequent request.

Paste the output of the below [az cli](https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest) command as the value of secret variable, for example 'AZURE_CREDENTIALS'
```bash  

   az ad sp create-for-rbac --name "mySQLServer" --role contributor \
                            --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group} \
                            --sdk-auth
                            
  # Replace {subscription-id}, {resource-group} and {server-name} with the subscription, resource group and name of the Azure SQL server
  
  # The command should output a JSON object similar to this:

  {
    "clientId": "<GUID>",
    "clientSecret": "<GUID>",
    "subscriptionId": "<GUID>",
    "tenantId": "<GUID>",
    (...)
  }
  
```
 
### Sample workflow to deploy to an Azure SQL database

```yaml
# .github/workflows/sql-deploy.yml
on: [push]

jobs:
  build:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v1
    - uses: azure/login@v1
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}
    - uses: azure/sql-action@v1
      with:
        server-name: REPLACE_THIS_WITH_YOUR_SQL_SERVER_NAME
        connection-string: ${{ secrets.AZURE_SQL_CONNECTION_STRING }}
        dacpac-package: './Database.dacpac'
 ```

  **Note:-** 
 The above means you have to create secrets in GitHub which can be found within your repository within **Settings** and then **Secrets** and also
 be careful to check the connection string which you copy from Azure SQL as the connection string has this **Password={your_password}** and you will need to supply
 the correct password for your connection string.

 ## How to create a dacpac file from your existing SQL Server Database
 
 For the above action to work you will need to create a file calles Database.dacpac and place it into the root of your
 GitHub repository. The following link will show you how to go about creating a dacpac file but make sure the file is called Database.dacpac

 https://docs.microsoft.com/en-us/sql/relational-databases/data-tier-applications/export-a-data-tier-application?view=sql-server-ver15



# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
