import * as exec from '@actions/exec';
import AzureSqlAction, { IDacpacActionInputs, ISqlActionInputs, ActionType, SqlPackageAction } from "../src/AzureSqlAction";
import AzureSqlActionHelper from "../src/AzureSqlActionHelper";
import SqlConnectionStringBuilder from '../src/SqlConnectionStringBuilder';

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
        
        expect(action.execute()).rejects;
        expect(getSqlPackagePathSpy).toHaveBeenCalledTimes(1);
    });

    it('executes sal action for SqlAction type', async () => {
        let inputs = getInputs(ActionType.SqlAction) as ISqlActionInputs;
        inputs.additionalArguments = '-t 20'
        let action = new AzureSqlAction(inputs);
        
        let getSqlCmdPathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe');
        let execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
        
        await action.execute();

        expect(getSqlCmdPathSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledWith(`"SqlCmd.exe" -S testServer.database.windows.net -d testDB -U "testUser" -P "testPassword" -i "./TestFile.sql" -t 20`);
    });

    it('throws if SqlCmd.exe fails to execute sql', async () => {
        let inputs = getInputs(ActionType.SqlAction) as ISqlActionInputs;
        let action = new AzureSqlAction(inputs);

        let getSqlCmdPathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe');
        jest.spyOn(exec, 'exec').mockRejectedValue(1); 
        
        expect(action.execute()).rejects;
        expect(getSqlCmdPathSpy).toHaveBeenCalledTimes(1);
    });
});

function getInputs(actionType: ActionType) {
    switch(actionType) {
        case ActionType.DacpacAction: {
            return{
                serverName: 'testServer.database.windows.net',
                actionType: ActionType.DacpacAction,
                connectionString: new SqlConnectionStringBuilder('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=testPassword'),
                dacpacPackage: './TestPackage.dacpac',
                sqlpackageAction: SqlPackageAction.Publish,
                additionalArguments: '/TargetTimeout:20'
            } as IDacpacActionInputs;
        }
        case ActionType.SqlAction: {
            return {
                serverName: 'testServer.database.windows.net',
                actionType: ActionType.SqlAction,
                connectionString: new SqlConnectionStringBuilder('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=testPassword'),
                sqlFile: './TestFile.sql',
                additionalArguments: '-t 20'
            } as ISqlActionInputs;
        }
    }
}