import * as core from '@actions/core';
import AzureSqlResourceManager, { FirewallRule } from './AzureSqlResourceManager';

export default class FirewallManager {
    constructor(azureSqlResourceManager: AzureSqlResourceManager) {
        this._resourceManager = azureSqlResourceManager;
    }

    public async addFirewallRule(ipAddress: string) {
        if (!ipAddress) {
            core.debug(`Client has access to Sql server. Skip adding firewall exception.`);
            return;
        }
        console.log(`Client does not have access to Sql server. Adding firewall exception for client's IP address.`)
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

    private _resourceManager: AzureSqlResourceManager;
    private _firewallRule?: FirewallRule; 
}