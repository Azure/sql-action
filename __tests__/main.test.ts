import * as core from "@actions/core";
import { AuthorizerFactory } from 'azure-actions-webclient/AuthorizerFactory';

import run from "../src/main";
import AzureSqlAction, { ActionType, IActionInputs, IBuildAndPublishInputs, IDacpacActionInputs, SqlPackageAction } from "../src/AzureSqlAction";
import FirewallManager from "../src/FirewallManager";
import AzureSqlActionHelper from '../src/AzureSqlActionHelper';
import SqlUtils from '../src/SqlUtils';

jest.mock('@actions/core');
jest.mock('azure-actions-webclient/AuthorizerFactory');
jest.mock('../src/AzureSqlAction');
jest.mock('../src/FirewallManager');
jest.mock('../src/AzureSqlResourceManager');
jest.mock('../src/Setup');

describe('main.ts tests', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it('gets inputs and executes build and publish action', async () => {
        const resolveFilePathSpy = jest.spyOn(AzureSqlActionHelper, 'resolveFilePath').mockReturnValue('./TestProject.sqlproj');
        const getInputSpy = jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
            switch(name) {
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'path': return './TestProject.sqlproj';
                case 'action': return 'publish';
                case 'arguments': return '/p:FakeSqlpackageArgument';
                case 'build-arguments': return '-p FakeDotnetArgument';
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
        expect(AzureSqlAction).toHaveBeenCalledWith(
            expect.objectContaining({
                actionType: ActionType.BuildAndPublish,
                filePath: './TestProject.sqlproj',
                buildArguments: '-p FakeDotnetArgument',
                sqlpackageAction: SqlPackageAction.Publish,
                additionalArguments: '/p:FakeSqlpackageArgument'
            } as IBuildAndPublishInputs)
        );

        expect(detectIPAddressSpy).toHaveBeenCalled();
        expect(getAuthorizerSpy).not.toHaveBeenCalled();
        expect(getInputSpy).toHaveBeenCalledTimes(6);
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
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'path': return './TestDacpacPackage.dacpac';
                case 'action': return 'script';
                case 'arguments': return '/p:FakeSqlpackageArgument';
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
        expect(AzureSqlAction).toHaveBeenCalledWith(
            expect.objectContaining({
                actionType: ActionType.DacpacAction,
                filePath: './TestDacpacPackage.dacpac',
                sqlpackageAction: SqlPackageAction.Script,
                additionalArguments: '/p:FakeSqlpackageArgument'
            } as IDacpacActionInputs)
        );

        expect(detectIPAddressSpy).toHaveBeenCalled();
        expect(getAuthorizerSpy).not.toHaveBeenCalled();
        expect(getInputSpy).toHaveBeenCalledTimes(5);
        expect(resolveFilePathSpy).toHaveBeenCalled();
        expect(addFirewallRuleSpy).not.toHaveBeenCalled();
        expect(actionExecuteSpy).toHaveBeenCalled();
        expect(removeFirewallRuleSpy).not.toHaveBeenCalled();
        expect(setFailedSpy).not.toHaveBeenCalled();
    })

    it('gets inputs and executes dacpac action with optional sqlpackage path', async () => {
        let resolveFilePathSpy = jest.spyOn(AzureSqlActionHelper, 'resolveFilePath').mockReturnValue('./TestDacpacPackage.dacpac');
        let getInputSpy = jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
            switch(name) {
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'path': return './TestDacpacPackage.dacpac';
                case 'action': return 'script';
                case 'arguments': return '/p:FakeSqlpackageArgument';
                case 'sqlpackage-path': return '/path/to/sqlpackage';
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
        expect(AzureSqlAction).toHaveBeenCalledWith(
            expect.objectContaining({
                actionType: ActionType.DacpacAction,
                filePath: './TestDacpacPackage.dacpac',
                sqlpackageAction: SqlPackageAction.Script,
                additionalArguments: '/p:FakeSqlpackageArgument',
                sqlpackagePath: '/path/to/sqlpackage'
            } as IDacpacActionInputs)
        );

        expect(detectIPAddressSpy).toHaveBeenCalled();
        expect(getAuthorizerSpy).not.toHaveBeenCalled();
        expect(getInputSpy).toHaveBeenCalledTimes(5);
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
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'path': return './TestSqlFile.sql';
                case 'arguments': return '-v FakeSqlcmdArgument';
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
        expect(AzureSqlAction).toHaveBeenCalledWith(
            expect.objectContaining({
                actionType: ActionType.SqlAction,
                filePath: './TestSqlFile.sql',
                additionalArguments: '-v FakeSqlcmdArgument'
            } as IActionInputs)
        );

        expect(detectIPAddressSpy).toHaveBeenCalled();
        expect(getAuthorizerSpy).not.toHaveBeenCalled();
        expect(getInputSpy).toHaveBeenCalledTimes(4);
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
                case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                case 'path': return './TestSqlFile.sql';
                case 'action': return 'publish';
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

    describe('validate errors on unsupported sqlpackage action types', () => {
        const inputs = [ ['Extract'], ['Export'], ['Import'], ['InvalidAction'] ];

        it.each(inputs)('Throws for unsupported action %s', async (actionName) => {
            let resolveFilePathSpy = jest.spyOn(AzureSqlActionHelper, 'resolveFilePath').mockReturnValue('./TestDacpacPackage.dacpac');
            let setFailedSpy = jest.spyOn(core, 'setFailed');
            let getInputSpy = jest.spyOn(core, 'getInput').mockImplementation((name, options) => {
                switch(name) {
                    case 'connection-string': return 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder;';
                    case 'path': return './TestDacpacPackage.dacpac';
                    case 'action': return actionName;
                    default: return '';
                }
            });

            await run();

            expect(resolveFilePathSpy).toHaveBeenCalled();
            expect(getInputSpy).toHaveBeenCalled();
            expect(setFailedSpy).toHaveBeenCalled();
            expect(setFailedSpy).toHaveBeenCalledWith(`Action ${actionName} is invalid. Supported action types are: Publish, Script, DriftReport, or DeployReport.`);
        });
    });
})