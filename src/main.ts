import * as core from "@actions/core";
import * as crypto from "crypto";
import * as path from 'path';
import { AuthorizerFactory } from "azure-actions-webclient/AuthorizerFactory";

import AzureSqlAction, { IActionInputs, ISqlActionInputs, IDacpacActionInputs, ActionType, SqlPackageAction, IBuildAndPublishInputs } from "./AzureSqlAction";
import AzureSqlResourceManager from './AzureSqlResourceManager'
import FirewallManager from "./FirewallManager";
import AzureSqlActionHelper from "./AzureSqlActionHelper";
import SqlConnectionStringBuilder from "./SqlConnectionStringBuilder";
import SqlUtils from "./SqlUtils";
import Constants from "./Constants";

let userAgentPrefix = !!process.env.AZURE_HTTP_USER_AGENT ? `${process.env.AZURE_HTTP_USER_AGENT}` : "";

export default async function run() {
    let firewallManager;
    try {
        // Set user agent variable
        let usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
        let actionName = 'AzureSqlAction';
        let userAgentString = (!!userAgentPrefix ? `${userAgentPrefix}+` : '') + `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
        core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);
        
        let inputs = getInputs();
        let azureSqlAction = new AzureSqlAction(inputs);
        
        const runnerIPAddress = await SqlUtils.detectIPAddress(inputs.serverName, inputs.connectionString);
        if (runnerIPAddress) {
            let azureResourceAuthorizer = await AuthorizerFactory.getAuthorizer();
            let azureSqlResourceManager = await AzureSqlResourceManager.getResourceManager(inputs.serverName, azureResourceAuthorizer);
            firewallManager = new FirewallManager(azureSqlResourceManager);
            await firewallManager.addFirewallRule(runnerIPAddress);
        }
        await azureSqlAction.execute();
    }
    catch (error) {
        core.setFailed(error.message);
    }
    finally {
        if (firewallManager) {
            await firewallManager.removeFirewallRule();
        }

        // Reset AZURE_HTTP_USER_AGENT
        core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentPrefix);
    }
}

function getInputs(): IActionInputs {
    core.debug('Get action inputs.');
    let serverName = core.getInput('server-name', { required: true });
    let connectionString = core.getInput('connection-string', { required: true });
    let connectionStringBuilder = new SqlConnectionStringBuilder(connectionString);
    let additionalArguments = core.getInput('arguments');

    let dacpacPackage = core.getInput('dacpac-package');
    if (!!dacpacPackage) {
        dacpacPackage = AzureSqlActionHelper.resolveFilePath(dacpacPackage);
        if (path.extname(dacpacPackage).toLowerCase() !== Constants.dacpacExtension) {
            throw new Error(`Invalid dacpac file path provided as input ${dacpacPackage}`);
        }

        return {
            serverName: serverName,
            connectionString: connectionStringBuilder,
            dacpacPackage: dacpacPackage,
            sqlpackageAction: SqlPackageAction.Publish,
            actionType: ActionType.DacpacAction,
            additionalArguments: additionalArguments
        } as IDacpacActionInputs;
    }

    let sqlFilePath = core.getInput('sql-file');
    if (!!sqlFilePath) {
        sqlFilePath = AzureSqlActionHelper.resolveFilePath(sqlFilePath);
        if (path.extname(sqlFilePath).toLowerCase() !== '.sql') {
            throw new Error(`Invalid sql file path provided as input ${sqlFilePath}`);
        }

        return {
            serverName: serverName,
            connectionString: connectionStringBuilder,
            sqlFile: sqlFilePath,
            actionType: ActionType.SqlAction,
            additionalArguments: additionalArguments
        } as ISqlActionInputs;
    }

    let sqlProjPath = core.getInput('project-file');
    if (!!sqlProjPath) {
        sqlProjPath = AzureSqlActionHelper.resolveFilePath(sqlProjPath);
        if (path.extname(sqlProjPath).toLowerCase() !== Constants.sqlprojExtension) {
            throw new Error(`Invalid database project file path provided as input ${sqlProjPath}`);
        }

        const buildArguments = core.getInput('build-arguments');
        return {
            serverName: serverName,
            connectionString: connectionStringBuilder,
            actionType: ActionType.BuildAndPublish,
            additionalArguments: additionalArguments,
            projectFile: sqlProjPath,
            buildArguments: buildArguments
        } as IBuildAndPublishInputs;
    }
  
    throw new Error('Required SQL file, DACPAC package, or database project file to execute action.');
}

run();