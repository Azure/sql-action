import * as core from "@actions/core";
import * as crypto from "crypto";
import * as path from 'path';
import { AuthorizerFactory } from "azure-actions-webclient/AuthorizerFactory";

import AzureSqlAction, { IActionInputs, IDacpacActionInputs, IBuildAndPublishInputs, ActionType, SqlPackageAction } from "./AzureSqlAction";
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
        
        if (!inputs.useManagedInstance) {
            const runnerIPAddress = await SqlUtils.detectIPAddress(inputs.connectionConfig);
            if (runnerIPAddress) {
                let azureResourceAuthorizer = await AuthorizerFactory.getAuthorizer();
                let azureSqlResourceManager = await AzureSqlResourceManager.getResourceManager(inputs.connectionConfig.Config.server, azureResourceAuthorizer);
                firewallManager = new FirewallManager(azureSqlResourceManager);
                await firewallManager.addFirewallRule(runnerIPAddress);
            }
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

    let filePath = core.getInput('path', { required: true });
    filePath = AzureSqlActionHelper.resolveFilePath(filePath);

    // Optional inputs
    const action = core.getInput('action');
    const useManagedInstance = core.getInput('use-managed-instance') === 'true';

    switch (path.extname(filePath).toLowerCase()) {
        case Constants.sqlFileExtension:
            return {
                actionType: ActionType.SqlAction,
                connectionConfig: connectionConfig,
                filePath: filePath,
                useManagedInstance: useManagedInstance,
                additionalArguments: core.getInput('arguments') || undefined
            };

        case Constants.dacpacExtension:
            if (!action) {
                throw new Error('The action input must be specified when using a .dacpac file.');
            }

            return {
                actionType: ActionType.DacpacAction,
                connectionConfig: connectionConfig,
                filePath: filePath,
                useManagedInstance: useManagedInstance,
                sqlpackageAction: AzureSqlActionHelper.getSqlpackageActionTypeFromString(action),
                additionalArguments: core.getInput('arguments') || undefined
            } as IDacpacActionInputs;

        case Constants.sqlprojExtension:
            if (!action) {
                throw new Error('The action input must be specified when using a .sqlproj file.');
            }

            return {
                actionType: ActionType.BuildAndPublish,
                connectionConfig: connectionConfig,
                filePath: filePath,
                useManagedInstance: useManagedInstance,
                buildArguments: core.getInput('build-arguments') || undefined,
                sqlpackageAction: AzureSqlActionHelper.getSqlpackageActionTypeFromString(action),
                additionalArguments: core.getInput('arguments') || undefined
            } as IBuildAndPublishInputs;

            break;

        default:
            throw new Error(`Invalid file type provided as input ${filePath}. File must be a .sql, .dacpac, or .sqlproj file.`)
    }
}

run();
