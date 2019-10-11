import { AuthorizerFactory }  from 'azure-actions-webclient/AuthorizerFactory';
import { ServiceClient as AzureRestClient } from "azure-actions-webclient/AzureRestClient";
import AzureSqlResourceManager from '../src/AzureSqlResourceManager'

jest.mock('azure-actions-webclient/AuthorizerFactory');
jest.mock('azure-actions-webclient/AzureRestClient');

describe.only('AzureSqlResourceManager tests', () => {
    
    beforeAll(() => {
        jest.spyOn(AuthorizerFactory, 'getAuthorizer').mockResolvedValue({
            getToken: (force) => Promise.resolve('BearerToken'),
            subscriptionID: 'SubscriptionId',
            baseUrl: 'http://baseUrl',
            getCloudEndpointUrl: (name) => '',
            getCloudSuffixUrl: (suffixName) => '.database.windows.net'
        });
    })

    afterEach(() => {
        jest.restoreAllMocks();
    })

    it('initializes properly with server details', async () => {
        let getRequestUrlSpy = jest.spyOn(AzureRestClient.prototype, 'getRequestUri').mockReturnValue('https://randomUrl/');
        let beginRequestSpy = jest.spyOn(AzureRestClient.prototype, 'beginRequest').mockResolvedValue({
            statusCode: 200,
            body: {
                value: [
                    {
                        name: 'testServer',
                        id: '/subscriptions/SubscriptionId/resourceGroups/testrg/providers/Microsoft.sql/servers/testServer'
                    },
                    {
                        name: 'testServer2',
                        id: '/subscriptions/SubscriptionId/resourceGroups/testrg/providers/Microsoft.sql/servers/testServer2'
                    }
                ]
            },
            statusMessage: 'OK',
            headers: []
        });

        let resourceManager = await AzureSqlResourceManager.getResourceManager('testServer.database.windows.net', await AuthorizerFactory.getAuthorizer());
        let server = resourceManager.getSqlServer();
        
        expect(server!.name).toMatch('testServer');
        expect(getRequestUrlSpy).toHaveBeenCalledTimes(1);
        expect(beginRequestSpy).toHaveBeenCalledTimes(1);
    });

    it('throws if resource manager fails to initialize', async () => {
        let getRequestUrlSpy = jest.spyOn(AzureRestClient.prototype, 'getRequestUri').mockReturnValue('https://randomUrl/');
        let beginRequestSpy = jest.spyOn(AzureRestClient.prototype, 'beginRequest').mockResolvedValue({
            statusCode: 200,
            body: {
                value: [
                    {
                        name: 'testServer1',
                        id: '/subscriptions/SubscriptionId/resourceGroups/testrg/providers/Microsoft.sql/servers/testServer'
                    },
                    {
                        name: 'testServer2',
                        id: '/subscriptions/SubscriptionId/resourceGroups/testrg/providers/Microsoft.sql/servers/testServer2'
                    }
                ]
            },
            statusMessage: 'OK',
            headers: []
        });

        expect(AzureSqlResourceManager.getResourceManager('testServer.database.windows.net', await AuthorizerFactory.getAuthorizer())).rejects.toThrowError(new Error(`Unable to get details of SQL server testServer. Sql server 'testServer' was not found in the subscription.`));
        
        expect(getRequestUrlSpy).toHaveBeenCalledTimes(1);
        expect(beginRequestSpy).toHaveBeenCalledTimes(1);
    })

    describe('firewall operations', () => {

        let resourceManager: AzureSqlResourceManager;
        let beginRequestSpy;
        beforeAll(async () => {
            jest.spyOn(AzureRestClient.prototype, 'getRequestUri').mockReturnValue('https://randomUrl/');
            beginRequestSpy = jest.spyOn(AzureRestClient.prototype, 'beginRequest').mockResolvedValue({
                statusCode: 200,
                body: {
                    value: [
                        {
                            name: 'testServer',
                            id: '/subscriptions/SubscriptionId/resourceGroups/testrg/providers/Microsoft.sql/servers/testServer'
                        },
                        {
                            name: 'testServer2',
                            id: '/subscriptions/SubscriptionId/resourceGroups/testrg/providers/Microsoft.sql/servers/testServer2'
                        }
                    ]
                },
                statusMessage: 'OK',
                headers: []
            });

            resourceManager = await AzureSqlResourceManager.getResourceManager('testServer.database.windows.net', await AuthorizerFactory.getAuthorizer());
            beginRequestSpy.mockReset();
        })

        it('adds firewall rule successfully', async () => {
            beginRequestSpy.mockResolvedValue({
                statusMessage: 'OK',
                statusCode: 200,
                body: {
                    name: 'FirewallRuleName'
                },
                headers: []
            });
    
            let firewallRule = await resourceManager.addFirewallRule('1.2.3.4', '1.2.3.4');
            
            expect(beginRequestSpy).toHaveBeenCalledTimes(1);
            expect(firewallRule.name).toMatch('FirewallRuleName');
            beginRequestSpy.mockReset();
        }) 
        
        it('removes firewall rule successfully', async () => {
            beginRequestSpy.mockResolvedValue({
                statusMessage: 'OK',
                statusCode: 200,
                body: {},
                headers: []
            })

            await resourceManager.removeFirewallRule({ name: 'FirewallRuleName' } as any);

            expect(beginRequestSpy).toHaveBeenCalledTimes(1);
        })
    })
});