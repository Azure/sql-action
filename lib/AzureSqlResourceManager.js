"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const AzureRestClient_1 = require("azure-actions-webclient/AzureRestClient");
class AzureSqlResourceManager {
    constructor(resourceAuthorizer) {
        // making the constructor private, so that object initialization can only be done by the class factory GetResourceManager
        this._authorizer = resourceAuthorizer;
        this._restClient = new AzureRestClient_1.ServiceClient(resourceAuthorizer);
    }
    static getResourceManager(serverName, resourceAuthorizer) {
        return __awaiter(this, void 0, void 0, function* () {
            // a factory method to return asynchronously created object
            let resourceManager = new AzureSqlResourceManager(resourceAuthorizer);
            yield resourceManager._populateSqlServerData(serverName);
            return resourceManager;
        });
    }
    getSqlServer() {
        return this._resource;
    }
    addFirewallRule(startIpAddress, endIpAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            let today = new Date();
            let firewallRuleName = `ClientIPAddress_${today.getFullYear()}-${today.getMonth()}-${today.getDay()}_${startIpAddress}`;
            let httpRequest = {
                method: 'PUT',
                uri: this._restClient.getRequestUri(`/${this._resource.id}/firewallRules/${firewallRuleName}`, {}, [], '2014-04-01'),
                body: JSON.stringify({
                    'properties': {
                        'startIpAddress': startIpAddress,
                        'endIpAddress': endIpAddress
                    }
                })
            };
            try {
                let httpResponse = yield this._restClient.beginRequest(httpRequest);
                if (httpResponse.statusCode !== 200 && httpResponse.statusCode !== 201) {
                    throw AzureRestClient_1.ToError(httpResponse);
                }
                return httpResponse.body;
            }
            catch (error) {
                if (error instanceof AzureRestClient_1.AzureError) {
                    throw new Error(JSON.stringify(error));
                }
                throw error;
            }
        });
    }
    removeFirewallRule(firewallRule) {
        return __awaiter(this, void 0, void 0, function* () {
            let httpRequest = {
                method: 'DELETE',
                uri: this._restClient.getRequestUri(`/${this._resource.id}/firewallRules/${firewallRule.name}`, {}, [], '2014-04-01')
            };
            try {
                let httpResponse = yield this._restClient.beginRequest(httpRequest);
                if (httpResponse.statusCode !== 200 && httpResponse.statusCode !== 204) {
                    throw AzureRestClient_1.ToError(httpResponse);
                }
            }
            catch (error) {
                if (error instanceof AzureRestClient_1.AzureError) {
                    throw new Error(JSON.stringify(error));
                }
                throw error;
            }
        });
    }
    _populateSqlServerData(serverName) {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlServerHostNameSuffix = this._authorizer.getCloudSuffixUrl('sqlServerHostname');
            if (serverName.endsWith(sqlServerHostNameSuffix)) {
                // remove the sqlServerHostname suffix from server url if it exists
                serverName = serverName.slice(0, serverName.lastIndexOf(sqlServerHostNameSuffix));
            }
            let httpRequest = {
                method: 'GET',
                uri: this._restClient.getRequestUri('//subscriptions/{subscriptionId}/providers/Microsoft.Sql/servers', {}, [], '2015-05-01-preview')
            };
            try {
                let httpResponse = yield this._restClient.beginRequest(httpRequest);
                if (httpResponse.statusCode !== 200) {
                    throw AzureRestClient_1.ToError(httpResponse);
                }
                let sqlServers = httpResponse.body && httpResponse.body.value;
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
            catch (error) {
                if (error instanceof AzureRestClient_1.AzureError) {
                    throw new Error(JSON.stringify(error));
                }
                throw error;
            }
        });
    }
}
exports.default = AzureSqlResourceManager;
