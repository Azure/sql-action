import * as exec from '@actions/exec';
import { AuthorizerFactory }  from 'azure-actions-webclient/AuthorizerFactory';

import FirewallManager from "../src/FirewallManager";
import AzureSqlResourceManager from '../src/AzureSqlResourceManager'
import AzureSqlActionHelper from "../src/AzureSqlActionHelper";
import SqlConnectionStringBuilder from '../src/SqlConnectionStringBuilder';

jest.mock('azure-actions-webclient/AuthorizerFactory');
jest.mock('../src/AzureSqlResourceManager', () => ({
    getResourceManager: () => ({
        addFirewallRule: () => jest.fn(),
        removeFirewallRule: () => jest.fn()
    })
}));

let sqlConnectionStringBuilderMock = jest.mock('../src/SqlConnectionStringBuilder', () => {
    return ((connectionString) => {
        return {
            connectionString: connectionString,
            userId: 'testUder',
            password: 'testPassword',
            database: 'testDB'
        }
    })
})

describe('FirewallManager tests', () => {
    let azureSqlResourceManager: AzureSqlResourceManager;
    let firewallManager: FirewallManager;

    beforeAll(async () => {
        jest.spyOn(AuthorizerFactory, 'getAuthorizer').mockResolvedValue({
            getToken: (force) => Promise.resolve('BearerToken'),
            subscriptionID: 'SubscriptionId',
            baseUrl: 'http://baseUrl',
            getCloudEndpointUrl: (name) => '',
            getCloudSuffixUrl: (suffixName) => '.database.windows.net'
        });

        azureSqlResourceManager = await AzureSqlResourceManager.getResourceManager('testServer.database.windows.net', await AuthorizerFactory.getAuthorizer());    
        firewallManager = new FirewallManager(azureSqlResourceManager);
    })

    describe('it adds and removes firewall rules successfully', () => {     
        it('detects ip address and adds firewall rule successfully', async () => {
            let getSqlCmdPathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe');
    
            let sqlCmdErrror = `Sqlcmd: Error: Microsoft ODBC Driver 17 for SQL Server : Cannot open server 'testserver' requested by the login. Client with IP address '1.2.3.4' is not allowed to access the server.  To enable access, use the Windows Azure Management Portal or run sp_set_firewall_rule on the master database to create a firewall rule for this IP address or address range.  It may take up to five minutes for this change to take effect..`;
            let execSpy = jest.spyOn(exec, 'exec').mockImplementation((commandLine, args, options) => {
                options!.listeners!.stderr!(Buffer.from(sqlCmdErrror));
                return Promise.reject(1);
            }); 
            
            let addFirewallRuleSpy = jest.spyOn(azureSqlResourceManager, 'addFirewallRule').mockResolvedValue({ name: 'FirewallRuleName' } as any);
            await firewallManager.addFirewallRule('testServer.database.windows.net', new SqlConnectionStringBuilder('Server=tcp:testServer.database.windows.net, 1443;Initial Catalog=testDB;User Id=testUser;Password=testPassword'));
    
            expect(getSqlCmdPathSpy).toHaveBeenCalledTimes(1);
            expect(execSpy.mock.calls[0][0]).toMatch(`"SqlCmd.exe" -S testServer.database.windows.net -U "testUser" -P "testPassword" -Q "select getdate()"`);
            expect(addFirewallRuleSpy).toHaveBeenCalledTimes(1);
        })
    
        it('removes firewall rule successfully', async () => {
            let removeFirewallRuleSpy = jest.spyOn(azureSqlResourceManager, 'removeFirewallRule');
            firewallManager.removeFirewallRule();
    
            expect(removeFirewallRuleSpy).toHaveBeenCalledTimes(1);
            expect(removeFirewallRuleSpy.mock.calls[0][0].name).toMatch('FirewallRuleName');
        })
    })
    
    it('does not add firewall rule if client has access to Sql server', async () => {
        let getSqlCmdPathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe');
        let execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
        
        let addFirewallRuleSpy = jest.spyOn(azureSqlResourceManager, 'addFirewallRule').mockResolvedValue({ name: 'FirewallRuleName' } as any);
        await firewallManager.addFirewallRule('testServer.database.windows.net', new SqlConnectionStringBuilder('Server=tcp:testServer.database.windows.net, 1443;Initial Catalog=testDB;User Id=testUser;Password=testPassword'));

        expect(getSqlCmdPathSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(addFirewallRuleSpy).not.toHaveBeenCalled();
    })
})