import * as exec from '@actions/exec';
import * as core from '@actions/core';
import AzureSqlResourceManager, { FirewallRule } from './AzureSqlResourceManager';
import { AzureSqlActionHelper } from "./AzureSqlActionHelper";
import { SqlConnectionStringBuilder } from './SqlConnectionStringBuilder';

const ipv4MatchPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

export default class FirewallManager {
    constructor(azureSqlResourceManager: AzureSqlResourceManager) {
        this._resourceManager = azureSqlResourceManager;
    }

    public async addFirewallRule(serverName: string, connectionString: SqlConnectionStringBuilder) {
        let ipAddress = await this._detectIPAddress(serverName, connectionString);
        if (!ipAddress) {
            core.debug(`Client has access to Sql server. Skip adding firewall exception.`);
            return;
        }
        
        console.log(`Client does not have access to Sql server. Adding firewall rule for client with IP Address ${ipAddress}.`)
        
        this._firewallRule = await this._resourceManager.addFirewallRule(ipAddress, ipAddress);
        core.debug(JSON.stringify(this._firewallRule));

        console.log(`Successfully added firewall rule ${this._firewallRule.name}.`);
    }

    public async removeFirewallRule() {
        if (this._firewallRule) {
            console.log(`Removing firewall rule '${this._firewallRule.name}'.`);
            await this._resourceManager.removeFirewallRule(this._firewallRule);
            console.log('Successfully removed firewall rule.');
        }
    }

    private async _detectIPAddress(serverName: string, connectionString: SqlConnectionStringBuilder): Promise<string> {
        let sqlCmdPath = await AzureSqlActionHelper.getSqlCmdPath();

        let ipAddress = '';
        let sqlCmdError = '';
        
        try {
            core.debug(`Validating if client '${process.env.computername}' has access to Sql Server '${serverName}'.`);
            core.debug(`"${sqlCmdPath}" -S ${serverName} -U "${connectionString.userId}" -Q "select getdate()"`);
            await exec.exec(`"${sqlCmdPath}" -S ${serverName} -U "${connectionString.userId}" -P "${connectionString.password}" -Q "select getdate()"`, [], {
                silent: true,
                listeners: {
                    stderr: (data: Buffer) => sqlCmdError += data.toString()
                }
            });
        }
        catch (error) {
            core.debug(sqlCmdError);
            let ipAddresses = sqlCmdError.match(ipv4MatchPattern);

            if (!!ipAddresses) {
                ipAddress = ipAddresses[0];      
            }
            else {
                throw new Error(`Failed to add firewall rule. Unable to detect client IP Address. ${sqlCmdError} ${error}`)
            }
        }

        //ipAddress will be an empty string if client has access to SQL server
        return ipAddress;
    }

    private _resourceManager: AzureSqlResourceManager;
    private _firewallRule?: FirewallRule; 
}