import * as core from "@actions/core";
import { AuthorizerFactory } from 'azure-actions-webclient/AuthorizerFactory';

import run from "../src/main";
import AzureSqlAction from "../src/AzureSqlAction";
import FirewallManager from "../src/FirewallManager";
import AzureSqlActionHelper from '../src/AzureSqlActionHelper';
import SqlConnectionStringBuilder from '../src/SqlConnectionStringBuilder';
import SqlUtils from '../src/SqlUtils';

jest.mock('@actions/core');
jest.mock('azure-actions-webclient/AuthorizerFactory');
jest.mock('../src/AzureSqlAction');
jest.mock('../src/FirewallManager');
jest.mock('../src/AzureSqlResourceManager');
jest.mock('../src/SqlConnectionStringBuilder');

describe('main.ts tests', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    })

    it('gets inputs and executes build and publish action', async () => {
        const resolveFilePathSpy = jest.spyOn(AzureSqlActionHelper, 'resolveFilePath').mockReturnValue('./TestProject.sqlproj');
        const getInputSpy = jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
            switch(name) {
                case 'server-name': return 'test2.database.windows.net';
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'project-file': return './TestProject.sqlproj';
                default : return '';
            }
        });
        
        const getAuthorizerSpy = jest.spyOn(AuthorizerFactory, 'getAuthorizer');
        const addFirewallRuleSpy = jest.spyOn(FirewallManager.prototype, 'addFirewallRule');
        const actionExecuteSpy = jest.spyOn(AzureSqlAction.prototype, 'execute');
        const removeFirewallRuleSpy = jest.spyOn(FirewallManager.prototype, 'removeFirewallRule');
        const setFailedSpy = jest.spyOn(core, 'setFailed');
        const detectIPAddressSpy = SqlUtils.detectIPAddress = jest.fn().mockImplementationOnce(() => {
            return "";
        });

        await run();

        expect(AzureSqlAction).toHaveBeenCalled();
        expect(detectIPAddressSpy).toHaveBeenCalled();
        expect(getAuthorizerSpy).not.toHaveBeenCalled();
        expect(getInputSpy).toHaveBeenCalledTimes(7);
        expect(SqlConnectionStringBuilder).toHaveBeenCalled();
        expect(resolveFilePathSpy).toHaveBeenCalled();
        expect(addFirewallRuleSpy).not.toHaveBeenCalled();
        expect(actionExecuteSpy).toHaveBeenCalled();
        expect(removeFirewallRuleSpy).not.toHaveBeenCalled();
        expect(setFailedSpy).not.toHaveBeenCalled();
    });

    it('gets inputs and executes dacpac action', async () => {
        let resolveFilePathSpy = jest.spyOn(AzureSqlActionHelper, 'resolveFilePath').mockReturnValue('./TestDacpacPackage.dacpac');
        let getInputSpy = jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
            switch(name) {
                case 'server-name': return 'test2.database.windows.net';
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'dacpac-package': return './TestDacpacPackage.dacpac';
            }

            return '';
        });
        
        let getAuthorizerSpy = jest.spyOn(AuthorizerFactory, 'getAuthorizer');
        let addFirewallRuleSpy = jest.spyOn(FirewallManager.prototype, 'addFirewallRule');
        let actionExecuteSpy = jest.spyOn(AzureSqlAction.prototype, 'execute');
        let removeFirewallRuleSpy = jest.spyOn(FirewallManager.prototype, 'removeFirewallRule');
        let setFailedSpy = jest.spyOn(core, 'setFailed');
        let detectIPAddressSpy = SqlUtils.detectIPAddress = jest.fn().mockImplementationOnce(() => {
            return "";
        });

        await run();

        expect(AzureSqlAction).toHaveBeenCalled();
        expect(detectIPAddressSpy).toHaveBeenCalled();
        expect(getAuthorizerSpy).not.toHaveBeenCalled();
        expect(getInputSpy).toHaveBeenCalledTimes(4);
        expect(SqlConnectionStringBuilder).toHaveBeenCalled();
        expect(resolveFilePathSpy).toHaveBeenCalled();
        expect(addFirewallRuleSpy).not.toHaveBeenCalled();
        expect(actionExecuteSpy).toHaveBeenCalled();    
        expect(removeFirewallRuleSpy).not.toHaveBeenCalled();     
        expect(setFailedSpy).not.toHaveBeenCalled(); 
    })
 
    it('gets inputs and executes sql action', async () => {
        let resolveFilePathSpy = jest.spyOn(AzureSqlActionHelper, 'resolveFilePath').mockReturnValue('./TestSqlFile.sql');
        let getInputSpy = jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
            switch(name) {
                case 'server-name': return 'test1.database.windows.net';
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'sql-file': return './TestSqlFile.sql';
                default: return '';
            }
        });

        let setFailedSpy = jest.spyOn(core, 'setFailed');
        let getAuthorizerSpy = jest.spyOn(AuthorizerFactory, 'getAuthorizer');
        let addFirewallRuleSpy = jest.spyOn(FirewallManager.prototype, 'addFirewallRule');
        let actionExecuteSpy = jest.spyOn(AzureSqlAction.prototype, 'execute');
        let removeFirewallRuleSpy = jest.spyOn(FirewallManager.prototype, 'removeFirewallRule');
        let detectIPAddressSpy = SqlUtils.detectIPAddress = jest.fn().mockImplementationOnce(() => {
            return "";
        });

        await run();

        expect(AzureSqlAction).toHaveBeenCalled();
        expect(detectIPAddressSpy).toHaveBeenCalled();
        expect(getAuthorizerSpy).not.toHaveBeenCalled();
        expect(getInputSpy).toHaveBeenCalledTimes(5);
        expect(SqlConnectionStringBuilder).toHaveBeenCalled();
        expect(resolveFilePathSpy).toHaveBeenCalled();
        expect(addFirewallRuleSpy).not.toHaveBeenCalled();
        expect(actionExecuteSpy).toHaveBeenCalled();    
        expect(removeFirewallRuleSpy).not.toHaveBeenCalled();      
        expect(setFailedSpy).not.toHaveBeenCalled(); 
    })

    it('throws if input file is not found', async() => {
        jest.spyOn(AzureSqlActionHelper, 'resolveFilePath').mockImplementation(() => {
            throw new Error(`Unable to find file at location`);
        });

        jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
            switch(name) {
                case 'server-name': return 'test1.database.windows.net';
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'sql-file': return './TestSqlFile.sql';
                default: return '';
            }
        });
        let detectIPAddressSpy = SqlUtils.detectIPAddress = jest.fn().mockImplementationOnce(() => {
            return "";
        });

        let setFailedSpy = jest.spyOn(core, 'setFailed');
        await run();

        expect(AzureSqlAction).not.toHaveBeenCalled();
        expect(detectIPAddressSpy).not.toHaveBeenCalled();
        expect(setFailedSpy).toHaveBeenCalledWith('Unable to find file at location'); 
    })
})