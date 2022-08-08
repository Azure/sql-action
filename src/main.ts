import * as core from "@actions/core";
import * as crypto from "crypto";
import * as path from 'path';
import { AuthorizerFactory } from "azure-actions-webclient/AuthorizerFactory";

import AzureSqlAction, { IActionInputs, ISqlActionInputs, IDacpacActionInputs, IBuildAndPublishInputs, ActionType, SqlPackageAction } from "./AzureSqlAction";
import AzureSqlResourceManager from './AzureSqlResourceManager';
import FirewallManager from "./FirewallManager";
import AzureSqlActionHelper from "./AzureSqlActionHelper";
import SqlConnectionConfig from "./SqlConnectionConfig";
import SqlUtils from "./SqlUtils";
import Constants from "./Constants";
import Setup from "./Setup";

const userAgentPrefix = !!process.env.AZURE_HTTP_USER_AGENT ? `${process.env.AZURE_HTTP_USER_AGENT}` : "";

export default async function run() {
    await Setup.setupSqlcmd();

    let firewallManager;
    try {
        setUserAgentVariable();
        
        const inputs = getInputs();
        const azureSqlAction = new AzureSqlAction(inputs);
        
        const runnerIPAddress = await SqlUtils.detectIPAddress(inputs.connectionConfig);
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

function setUserAgentVariable(): void {
    const usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
    const actionName = 'AzureSqlAction';
    const userAgentString = (!!userAgentPrefix ? `${userAgentPrefix}+` : '') + `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
    core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);
}

function getInputs(): IActionInputs {
    core.debug('Get action inputs.');

    const connectionString = core.getInput('connection-string', { required: true });
    const connectionConfig = new SqlConnectionConfig(connectionString);

    // TODO: Deprecate server-name as input
    let serverName = core.getInput('server-name', { required: false });
    if ((!!serverName && !!connectionConfig.Config.server) && (serverName != connectionConfig.Config.server)) 
        core.debug("'server-name' is conflicting with 'server' property specified in the connection string. 'server-name' will take precedence.");

    // if serverName has not been specified, use the server name from the connection string
    if (!serverName) serverName = connectionConfig.Config.server;

    const additionalArguments = core.getInput('arguments');

    let dacpacPackage = core.getInput('dacpac-package');
    if (!!dacpacPackage) {
        dacpacPackage = AzureSqlActionHelper.resolveFilePath(dacpacPackage);
        if (path.extname(dacpacPackage).toLowerCase() !== Constants.dacpacExtension) {
            throw new Error(`Invalid dacpac file path provided as input ${dacpacPackage}`);
        }

        if (!serverName) {
            throw new Error(`Missing server name or address in the configuration.`);
        }

        return {
            serverName: serverName,
            connectionConfig: connectionConfig,
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

        if (!serverName) {
            throw new Error(`Missing server name or address in the configuration.`);
        }

        return {
            serverName: serverName,
            connectionConfig: connectionConfig,
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
            connectionConfig: connectionConfig,
            actionType: ActionType.BuildAndPublish,
            additionalArguments: additionalArguments,
            projectFile: sqlProjPath,
            buildArguments: buildArguments
        } as IBuildAndPublishInputs;
    }

    throw new Error('Required SQL file, DACPAC package, or database project file to execute action.');
}

run();
