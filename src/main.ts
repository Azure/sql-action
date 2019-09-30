import * as core from "@actions/core";
import * as path from 'path';

import { AzureSqlAction, IActionInputs, ISqlActionInputs, IDacpacActionInputs, ActionType, SqlPackageAction } from "./AzureSqlAction";
import { AzureSqlActionHelper } from "./AzureSqlActionHelper";
import { AuthorizerFactory } from "./WebClient/Authorizer/AuthorizerFactory";
import { AzureSqlResourceManager } from './AzureSqlResourceManager'
import { FirewallManager } from "./FirewallManager";
import { ConnectionStringParser, SqlConnectionString } from "./ConnectionStringParser";

async function run() {
    let firewallManager;
    try {
        let inputs = getInputs();

        let azureSqlAction = new AzureSqlAction(inputs);
        
        let azureResourceAuthorizer = await AuthorizerFactory.getAuthorizer();
        let azureSqlResourceManager = await AzureSqlResourceManager.GetResourceManager(inputs.serverName, azureResourceAuthorizer);
        firewallManager = new FirewallManager(azureSqlResourceManager);

        await firewallManager.addFirewallRule(inputs.serverName, inputs.parsedConnectionString);
        await azureSqlAction.execute();

        // remove the below statement before checking-in
        throw new Error('Test error for re-running checks');
    }
    catch (error) {
        core.setFailed(error.message);
    }
    finally {
        if (firewallManager) {
            await firewallManager.removeFirewallRule();
        }
    }
}

function getInputs(): IActionInputs {
    core.debug('Getting inputs.');
    let serverName = core.getInput('server-name', { required: true });
    
    let connectionString = core.getInput('connection-string', { required: true });
    let parsedConnectionString: SqlConnectionString = ConnectionStringParser.parseConnectionString(connectionString);
    
    let additionalArguments = core.getInput('arguments');
    let dacpacPackage = core.getInput('dacpac-package');

    if (!!dacpacPackage) {
        dacpacPackage = AzureSqlActionHelper.resolveFilePath(dacpacPackage);
        if (path.extname(dacpacPackage).toLowerCase() !== '.dacpac') {
            throw new Error(`Invalid dacpac file path provided as input ${dacpacPackage}`);
        }

        return {
            serverName: serverName,
            connectionString: connectionString,
            parsedConnectionString: parsedConnectionString,
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
            connectionString: connectionString,
            parsedConnectionString: parsedConnectionString,
            sqlFile: sqlFilePath,
            actionType: ActionType.SqlAction,
            additionalArguments: additionalArguments
        } as ISqlActionInputs;
    }
  
    throw new Error('Required SQL file or DACPAC package to execute action.');
}

run();