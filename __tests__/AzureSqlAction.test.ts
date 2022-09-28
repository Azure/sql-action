import * as path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import AzureSqlAction, { IBuildAndPublishInputs, IDacpacActionInputs, ActionType, SqlPackageAction, IActionInputs } from "../src/AzureSqlAction";
import AzureSqlActionHelper from "../src/AzureSqlActionHelper";
import DotnetUtils from '../src/DotnetUtils';
import SqlConnectionConfig from '../src/SqlConnectionConfig';
import Constants from '../src/Constants';

jest.mock('fs');

describe('AzureSqlAction tests', () => {
    afterEach(() => {
       jest.restoreAllMocks();
    });

    describe('validate sqlpackage calls for DacpacAction', () => {
        const inputs = [
            ['Publish', '/TargetTimeout:20'],
            ['Script', '/DeployScriptPath:script.sql'],
            ['DriftReport', '/OutputPath:report.xml'],
            ['DeployReport', '/OutputPath:report.xml']
        ];

        it.each(inputs)('Validate %s action with args %s', async (actionName, sqlpackageArgs) => {
            let inputs = getInputsWithCustomSqlPackageAction(ActionType.DacpacAction, SqlPackageAction[actionName], sqlpackageArgs) as IDacpacActionInputs;
            let action = new AzureSqlAction(inputs);
    
            let getSqlPackagePathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlPackagePath').mockResolvedValue('SqlPackage.exe');
            let execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
    
            await action.execute();
    
            expect(getSqlPackagePathSpy).toHaveBeenCalledTimes(1);
            expect(execSpy).toHaveBeenCalledTimes(1);
            expect(execSpy).toHaveBeenCalledWith(`"SqlPackage.exe" /Action:${actionName} /TargetConnectionString:"${inputs.connectionConfig.ConnectionString}" /SourceFile:"${inputs.filePath}" ${sqlpackageArgs}`);
        });
    });

    it('throws if SqlPackage.exe fails to publish dacpac', async () => {
        let inputs = getInputs(ActionType.DacpacAction) as IDacpacActionInputs;
        let action = new AzureSqlAction(inputs);

        let getSqlPackagePathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlPackagePath').mockResolvedValue('SqlPackage.exe');
        jest.spyOn(exec, 'exec').mockRejectedValue(1); 

        expect(await action.execute().catch(() => null)).rejects;
        expect(getSqlPackagePathSpy).toHaveBeenCalledTimes(1);
    });

    describe('sql script action tests for different auth types', () => {
        // Format: [test case description, connection string, expected sqlcmd arguments]
        const testCases = [
            ['SQL login', 'Server=testServer.database.windows.net;Database=testDB;User Id=testUser;Password=placeholder', '-S testServer.database.windows.net -d testDB -U "testUser" -i "./TestFile.sql" -t 20'],
            ['AAD password', 'Server=testServer.database.windows.net;Database=testDB;Authentication=Active Directory Password;User Id=testAADUser;Password=placeholder', '-S testServer.database.windows.net -d testDB --authentication-method=ActiveDirectoryPassword -U "testAADUser" -i "./TestFile.sql" -t 20'],
            ['AAD service principal', 'Server=testServer.database.windows.net;Database=testDB;Authentication=Active Directory Service Principal;User Id=appId;Password=placeholder', '-S testServer.database.windows.net -d testDB --authentication-method=ActiveDirectoryServicePrincipal -U "appId" -i "./TestFile.sql" -t 20'],
            ['AAD default', 'Server=testServer.database.windows.net;Database=testDB;Authentication=Active Directory Default;', '-S testServer.database.windows.net -d testDB --authentication-method=ActiveDirectoryDefault -i "./TestFile.sql" -t 20']
        ];

        it.each(testCases)('%s', async (testCase, connectionString, expectedSqlCmdCall) => {
            const inputs = getInputs(ActionType.SqlAction, connectionString) as IActionInputs;
            const action = new AzureSqlAction(inputs);
            const sqlcmdExe = process.platform === 'win32' ? 'sqlcmd.exe' : 'sqlcmd';
    
            const execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
            const exportVariableSpy = jest.spyOn(core, 'exportVariable').mockReturnValue();
    
            await action.execute();
    
            expect(execSpy).toHaveBeenCalledTimes(1);
            expect(execSpy).toHaveBeenCalledWith(`"${sqlcmdExe}" ${expectedSqlCmdCall}`);

            // Except for AAD default, password/client secret should be set as SqlCmdPassword environment variable
            if (inputs.connectionConfig.Config['authentication']?.type !== 'azure-active-directory-default') {
                expect(exportVariableSpy).toHaveBeenCalledTimes(1);
                expect(exportVariableSpy).toHaveBeenCalledWith(Constants.sqlcmdPasswordEnvVarName, "placeholder");
            }
            else {
                expect(exportVariableSpy).not.toHaveBeenCalled();
            }
        })
    });

    it('throws if SqlCmd.exe fails to execute sql', async () => {
        let inputs = getInputs(ActionType.SqlAction) as IActionInputs;
        let action = new AzureSqlAction(inputs);

        jest.spyOn(exec, 'exec').mockRejectedValue(1);

        expect(await action.execute().catch(() => null)).rejects;
    });

    describe('validate build actions', () => {
        const inputs = [
            ['Publish', '/p:DropPermissionsNotInSource=true'],
            ['Script', '/DeployScriptPath:script.sql'],
            ['DriftReport', '/OutputPath:report.xml'],
            ['DeployReport', '/OutputPath:report.xml']
        ];

        it.each(inputs)('Validate build and %s action with args %s', async (actionName, sqlpackageArgs) => {
            const inputs = getInputsWithCustomSqlPackageAction(ActionType.BuildAndPublish, SqlPackageAction[actionName], sqlpackageArgs) as IBuildAndPublishInputs;
            const action = new AzureSqlAction(inputs);
            const expectedDacpac = path.join('./bin/Debug', 'TestProject.dacpac');

            const parseCommandArgumentsSpy = jest.spyOn(DotnetUtils, 'parseCommandArguments').mockResolvedValue({});
            const findArgumentSpy = jest.spyOn(DotnetUtils, 'findArgument').mockResolvedValue(undefined);
            const getSqlPackagePathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlPackagePath').mockResolvedValue('SqlPackage.exe');
            const execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
    
            await action.execute();
    
            expect(parseCommandArgumentsSpy).toHaveBeenCalledTimes(1);
            expect(findArgumentSpy).toHaveBeenCalledTimes(2);
            expect(getSqlPackagePathSpy).toHaveBeenCalledTimes(1);
            expect(execSpy).toHaveBeenCalledTimes(2);
            expect(execSpy).toHaveBeenNthCalledWith(1, `dotnet build "./TestProject.sqlproj" -p:NetCoreBuild=true --verbose --test "test value"`);
            expect(execSpy).toHaveBeenNthCalledWith(2, `"SqlPackage.exe" /Action:${actionName} /TargetConnectionString:"${inputs.connectionConfig.ConnectionString}" /SourceFile:"${expectedDacpac}" ${sqlpackageArgs}`);
        });
    });

    it('throws if dotnet fails to build sqlproj', async () => {
        const inputs = getInputs(ActionType.BuildAndPublish) as IBuildAndPublishInputs;
        const action = new AzureSqlAction(inputs);

        const parseCommandArgumentsSpy = jest.spyOn(DotnetUtils, 'parseCommandArguments').mockResolvedValue({});
        jest.spyOn(exec, 'exec').mockRejectedValueOnce(1);

        expect(await action.execute().catch(() => null)).rejects;
        expect(parseCommandArgumentsSpy).toHaveBeenCalledTimes(1);
    });

    it('throws if build succeeds but fails to publish', async () => {
        const inputs = getInputs(ActionType.BuildAndPublish) as IBuildAndPublishInputs;
        const action = new AzureSqlAction(inputs);

        const parseCommandArgumentsSpy = jest.spyOn(DotnetUtils, 'parseCommandArguments').mockResolvedValue({});
        const getSqlPackagePathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlPackagePath').mockResolvedValue('SqlPackage.exe');
        const execSpy = jest.spyOn(exec, 'exec').mockImplementation((commandLine) => {
            // Mock implementation where dotnet build is successful but fails the SqlPackage publish 
            if (commandLine.indexOf('dotnet build') >= 0) {
                return Promise.resolve(0);
            } else {
                return Promise.reject(1);
            }
        });

        expect(await action.execute().catch(() => null)).rejects;
        expect(parseCommandArgumentsSpy).toHaveBeenCalledTimes(1);
        expect(getSqlPackagePathSpy).toHaveBeenCalledTimes(1);  // Verify build succeeds and calls into Publish
        expect(execSpy).toHaveBeenCalledTimes(2);
    });
});

/**
 * Gets test inputs used by the SQL action based on actionType.
 * @param actionType The action type used for testing
 * @param connectionString The custom connection string to be used for the test. If not specified, a default one using SQL login will be used.
 * @returns An ActionInputs objects based on the given action type.
 */
function getInputs(actionType: ActionType, connectionString: string = ''): IActionInputs {

    const defaultConnectionString = 'Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder';
    const config = connectionString ? new SqlConnectionConfig(connectionString) : new SqlConnectionConfig(defaultConnectionString);

    switch(actionType) {
        case ActionType.DacpacAction: {
            return {
                actionType: ActionType.DacpacAction,
                connectionConfig: config,
                filePath: './TestPackage.dacpac',
                sqlpackageAction: SqlPackageAction.Publish,
                additionalArguments: '/TargetTimeout:20'
            } as IDacpacActionInputs;
        }
        case ActionType.SqlAction: {
            return {
                actionType: ActionType.SqlAction,
                connectionConfig: config,
                filePath: './TestFile.sql',
                additionalArguments: '-t 20'
            } as IActionInputs;
        }
        case ActionType.BuildAndPublish: {
            return {
                actionType: ActionType.BuildAndPublish,
                connectionConfig: config,
                filePath: './TestProject.sqlproj',
                buildArguments: '--verbose --test "test value"',
                sqlpackageAction: SqlPackageAction.Publish
            } as IBuildAndPublishInputs
        }
    }
}

/**
 * Gets test inputs used by SQL action based on actionType. Also accepts a custom SqlpackageAction type and additional arguments.
 * @param actionType The action type used for testing
 * @param sqlpackageAction The custom sqlpackage action type to test
 * @param additionalArguments Additional arguments for this action type.
 * @returns An ActionInputs objects based on the given action type.
 */
function getInputsWithCustomSqlPackageAction(actionType: ActionType, sqlpackageAction: SqlPackageAction, additionalArguments: string = ''): IActionInputs {
    const defaultConnectionConfig = new SqlConnectionConfig('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder');

    switch(actionType) {
        case ActionType.DacpacAction: {
            return {
                actionType: ActionType.DacpacAction,
                connectionConfig: defaultConnectionConfig,
                filePath: './TestPackage.dacpac',
                sqlpackageAction: sqlpackageAction,
                additionalArguments: additionalArguments
            } as IDacpacActionInputs;
        }
        case ActionType.SqlAction: {
            return {
                actionType: ActionType.SqlAction,
                connectionConfig: defaultConnectionConfig,
                filePath: './TestFile.sql',
                additionalArguments: additionalArguments
            } as IActionInputs;
        }
        case ActionType.BuildAndPublish: {
            return {
                actionType: ActionType.BuildAndPublish,
                connectionConfig: defaultConnectionConfig,
                filePath: './TestProject.sqlproj',
                buildArguments: '--verbose --test "test value"',
                sqlpackageAction: sqlpackageAction,
                additionalArguments: additionalArguments
            } as IBuildAndPublishInputs
        }
    }
}