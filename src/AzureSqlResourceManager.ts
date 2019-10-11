import { IAuthorizer } from 'azure-actions-webclient/Authorizer/IAuthorizer';
import { WebRequest } from 'azure-actions-webclient/WebClient';
import { ServiceClient as AzureRestClient, ToError, AzureError } from 'azure-actions-webclient/AzureRestClient'

export interface AzureSqlServer {
    id: string;
    kind: string;
    location: string;
    name: string;
    properties: {
        administratorLogin: string;
        administratorLoginPassword: string;
        fullyQualifiedDomainName: string;
        state: string;
        version: string;
    }
    type: string;
}

export interface FirewallRule {
    id: string;
    kind: string;
    location: string;
    name: string;
    type: string;
    properties: {
        startIpAddress: string;
        endIpAddress: string;
    }
}

export default class AzureSqlResourceManager {
    private constructor(resourceAuthorizer: IAuthorizer) {
        // making the constructor private, so that object initialization can only be done by the class factory GetResourceManager
        this._authorizer = resourceAuthorizer;
        this._restClient = new AzureRestClient(resourceAuthorizer);
    }

    public static async getResourceManager(serverName: string, resourceAuthorizer: IAuthorizer): Promise<AzureSqlResourceManager> {
        // a factory method to return asynchronously created object
        let resourceManager = new AzureSqlResourceManager(resourceAuthorizer);
        await resourceManager._populateSqlServerData(serverName);
        return resourceManager;
    }

    public getSqlServer() {
        return this._resource;
    }

    public async addFirewallRule(startIpAddress: string, endIpAddress: string): Promise<FirewallRule> {
        let today = new Date();
        let firewallRuleName = `ClientIPAddress_${today.getFullYear()}-${today.getMonth()}-${today.getDay()}_${startIpAddress}`;

        let httpRequest: WebRequest = {
            method: 'PUT',
            uri: this._restClient.getRequestUri(`/${this._resource!.id}/firewallRules/${firewallRuleName}`, {}, [], '2014-04-01'),
            body: JSON.stringify({
                'properties': {
                    'startIpAddress': startIpAddress,
                    'endIpAddress': endIpAddress
                }
            })
        };

        try {
            let httpResponse = await this._restClient.beginRequest(httpRequest);

            if (httpResponse.statusCode !== 200 && httpResponse.statusCode !== 201) {
                throw ToError(httpResponse);
            }

            return httpResponse.body as FirewallRule;
        }
        catch(error) {
            if (error instanceof AzureError) {
                throw new Error(JSON.stringify(error));
            }
            
            throw error;
        }
    }

    public async removeFirewallRule(firewallRule: FirewallRule): Promise<void> {
        let httpRequest: WebRequest = {
            method: 'DELETE',
            uri: this._restClient.getRequestUri(`/${this._resource!.id}/firewallRules/${firewallRule.name}`, {}, [], '2014-04-01')
        };

        try {
            let httpResponse = await this._restClient.beginRequest(httpRequest);

            if (httpResponse.statusCode !== 200 && httpResponse.statusCode !== 204) {
                throw ToError(httpResponse);
            }
        }
        catch(error) {
            if (error instanceof AzureError) {
                throw new Error(JSON.stringify(error));
            }
            
            throw error;
        }
    }

    private async _populateSqlServerData(serverName: string) {
        let sqlServerHostNameSuffix = this._authorizer.getCloudSuffixUrl('sqlServerHostname');
        if (serverName.endsWith(sqlServerHostNameSuffix)) {
            // remove the sqlServerHostname suffix from server url if it exists
            serverName = serverName.slice(0, serverName.lastIndexOf(sqlServerHostNameSuffix));
        }

        let httpRequest: WebRequest = {
            method: 'GET',
            uri: this._restClient.getRequestUri('//subscriptions/{subscriptionId}/providers/Microsoft.Sql/servers', {}, [], '2015-05-01-preview')
        }

        try {
            let httpResponse = await this._restClient.beginRequest(httpRequest);

            if (httpResponse.statusCode !== 200) {
                throw ToError(httpResponse);
            }

            let sqlServers = httpResponse.body && httpResponse.body.value as AzureSqlServer[];
            
            if (sqlServers && sqlServers.length > 0) {
                this._resource = sqlServers.filter((sqlResource) => sqlResource.name === serverName)[0];
                if (!this._resource) {
                    throw new Error(`Unable to get details of SQL server ${serverName}. Sql server '${serverName}' was not found in the subscription.`);
                }
            }
            else {
                throw new Error(`Unable to get details of SQL server ${serverName}. No SQL servers were found in the subscription.`);
            }
        }
        catch(error) {
            if (error instanceof AzureError) {
                throw new Error(JSON.stringify(error));
            }
            
            throw error;
        }
    }

    private _resource?: AzureSqlServer;
    private _restClient: AzureRestClient;
    private _authorizer: IAuthorizer;
}