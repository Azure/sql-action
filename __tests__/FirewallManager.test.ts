import { AuthorizerFactory }  from 'azure-actions-webclient/AuthorizerFactory';
import FirewallManager from "../src/FirewallManager";
import AzureSqlResourceManager from '../src/AzureSqlResourceManager'

jest.mock('azure-actions-webclient/AuthorizerFactory');
jest.mock('../src/AzureSqlResourceManager', () => ({
    getResourceManager: () => ({
        addFirewallRule: () => jest.fn(),
        removeFirewallRule: () => jest.fn()
    })
}));

describe('FirewallManager tests', () => {
    let azureSqlResourceManager: AzureSqlResourceManager;
    let firewallManager: FirewallManager;

    beforeAll(async () => {
        jest.spyOn(AuthorizerFactory, 'getAuthorizer').mockResolvedValue({
            getToken: (force) => Promise.resolve('BearerToken'),
            subscriptionID: 'SubscriptionId',
            baseUrl: 'http://baseUrl',
            getCloudEndpointUrl: (_name) => '',
            getCloudSuffixUrl: (_suffixName) => '.database.windows.net'
        });

        azureSqlResourceManager = await AzureSqlResourceManager.getResourceManager('testServer.database.windows.net', await AuthorizerFactory.getAuthorizer());    
        firewallManager = new FirewallManager(azureSqlResourceManager);
    });

    describe('it adds and removes firewall rules successfully', () => {     
        it('adds firewall rule successfully', async () => {
            let addFirewallRuleSpy = jest.spyOn(azureSqlResourceManager, 'addFirewallRule').mockResolvedValue({ name: 'FirewallRuleName' } as any);
            await firewallManager.addFirewallRule('1.2.3.4');
    
            expect(addFirewallRuleSpy).toHaveBeenCalledTimes(1);
        });
    
        it('removes firewall rule successfully', async () => {
            let removeFirewallRuleSpy = jest.spyOn(azureSqlResourceManager, 'removeFirewallRule');
            firewallManager.removeFirewallRule();
    
            expect(removeFirewallRuleSpy).toHaveBeenCalledTimes(1);
            expect(removeFirewallRuleSpy.mock.calls[0][0].name).toMatch('FirewallRuleName');
        });
    });

    it('does not add firewall rule if client has access to MySql server', async () => {
        let addFirewallRuleSpy = jest.spyOn(azureSqlResourceManager, 'addFirewallRule').mockResolvedValue({ name: 'FirewallRuleName' } as any);
        let removeFirewallRuleSpy = jest.spyOn(azureSqlResourceManager, 'removeFirewallRule');
        await firewallManager.addFirewallRule('');
        
        expect(addFirewallRuleSpy).not.toHaveBeenCalled();
        expect(removeFirewallRuleSpy).not.toHaveBeenCalled();
    });
    
})