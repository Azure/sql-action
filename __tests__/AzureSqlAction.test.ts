import * as path from 'path';
import * as exec from '@actions/exec';
import AzureSqlAction, { IBuildAndPublishInputs, IDacpacActionInputs, ISqlActionInputs, ActionType, SqlPackageAction } from "../src/AzureSqlAction";
import AzureSqlActionHelper from "../src/AzureSqlActionHelper";
import DotnetUtils from '../src/DotnetUtils';
import SqlConnectionStringBuilder from '../src/SqlConnectionStringBuilder';

let sqlConnectionStringBuilderMock = jest.mock('../src/SqlConnectionStringBuilder', () => {
    return ((connectionString) => {
        return {
            connectionString: connectionString,
            userId: 'testUser',
            password: 'placeholder',
            database: 'testDB'
        }
    })
})

describe('AzureSqlAction tests', () => {
    afterEach(() => {
       jest.restoreAllMocks();
    })

    it('executes dacpac action for DacpacAction type', async () => {
        let inputs = getInputs(ActionType.DacpacAction) as IDacpacActionInputs;
        let action = new AzureSqlAction(inputs);
        
        let getSqlPackagePathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlPackagePath').mockResolvedValue('SqlPackage.exe');
        let execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
        
        await action.execute();

        expect(getSqlPackagePathSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledWith(`"SqlPackage.exe" /Action:Publish /TargetConnectionString:"${inputs.connectionString.connectionString}" /SourceFile:"${inputs.dacpacPackage}" /TargetTimeout:20`);
    });
  
    it('throws if SqlPackage.exe fails to publish dacpac', async () => {
        let inputs = getInputs(ActionType.DacpacAction) as IDacpacActionInputs;
        let action = new AzureSqlAction(inputs);

        let getSqlPackagePathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlPackagePath').mockResolvedValue('SqlPackage.exe');
        jest.spyOn(exec, 'exec').mockRejectedValue(1); 
        
        expect(await action.execute().catch(() => null)).rejects;
        expect(getSqlPackagePathSpy).toHaveBeenCalledTimes(1);
    });

    it('executes sql action for SqlAction type', async () => {
        let inputs = getInputs(ActionType.SqlAction) as ISqlActionInputs;
        inputs.additionalArguments = '-t 20'
        let action = new AzureSqlAction(inputs);
        
        let getSqlCmdPathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe');
        let execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
        
        await action.execute();

        expect(getSqlCmdPathSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledWith(`"SqlCmd.exe" -S testServer.database.windows.net -d testDB -U "testUser" -P "placeholder" -i "./TestFile.sql" -t 20`);
    });

    it('throws if SqlCmd.exe fails to execute sql', async () => {
        let inputs = getInputs(ActionType.SqlAction) as ISqlActionInputs;
        let action = new AzureSqlAction(inputs);

        let getSqlCmdPathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe');
        jest.spyOn(exec, 'exec').mockRejectedValue(1);

        expect(await action.execute().catch(() => null)).rejects;
        expect(getSqlCmdPathSpy).toHaveBeenCalledTimes(1);
    });

    it('should build and publish database project', async () => {
        const inputs = getInputs(ActionType.BuildAndPublish) as IBuildAndPublishInputs;
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
        expect(execSpy).toHaveBeenNthCalledWith(2, `"SqlPackage.exe" /Action:Publish /TargetConnectionString:"${inputs.connectionString.connectionString}" /SourceFile:"${expectedDacpac}"`);
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

function getInputs(actionType: ActionType) {

    switch(actionType) {
        case ActionType.DacpacAction: {
            const connectionString = new SqlConnectionStringBuilder('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder');
            return {
                serverName: connectionString.server,
                actionType: ActionType.DacpacAction,
                connectionString: connectionString,
                dacpacPackage: './TestPackage.dacpac',
                sqlpackageAction: SqlPackageAction.Publish,
                additionalArguments: '/TargetTimeout:20'
            } as IDacpacActionInputs;
        }
        case ActionType.SqlAction: {
            const connectionString = new SqlConnectionStringBuilder('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder');
            return {
                serverName: connectionString.server,
                actionType: ActionType.SqlAction,
                connectionString: connectionString,
                sqlFile: './TestFile.sql',
                additionalArguments: '-t 20'
            } as ISqlActionInputs;
        }
        case ActionType.BuildAndPublish: {
            return {
                serverName: 'testServer.database.windows.net',
                actionType: ActionType.BuildAndPublish,
                connectionString: new SqlConnectionStringBuilder('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder'),
                projectFile: './TestProject.sqlproj',
                buildArguments: '--verbose --test "test value"'
            } as IBuildAndPublishInputs
        }
    }
}