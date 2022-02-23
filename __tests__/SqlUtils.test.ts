import * as exec from '@actions/exec';
import SqlUtils from "../src/SqlUtils";
import AzureSqlActionHelper from "../src/AzureSqlActionHelper";
import SqlConnectionStringBuilder from '../src/SqlConnectionStringBuilder';

describe('SqlUtils tests', () => {
    it('detectIPAddress should return ipaddress', async () => {
        let getSqlCmdPathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe');
        let execSpy = jest.spyOn(exec, 'exec').mockImplementation((_commandLine, _args, options) => {
            let sqlClientError = `Client with IP address '1.2.3.4' is not allowed to access the server.`;
            options!.listeners!.stderr!(Buffer.from(sqlClientError));
            return Promise.reject(1);
        }); 
        let ipAddress = await SqlUtils.detectIPAddress('serverName', new SqlConnectionStringBuilder('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder'));

        expect(getSqlCmdPathSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('1.2.3.4');
    });

    it('detectIPAddress should return empty', async () => {
        let getSqlCmdSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe');
        let execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
        let ipAddress = await SqlUtils.detectIPAddress('serverName', new SqlConnectionStringBuilder('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder'));

        expect(getSqlCmdSpy).toHaveBeenCalledTimes(1);
        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('');
    });

    it('detectIPAddress should throw error', () => {
        let getSqlCmdSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlCmdPath').mockResolvedValue('SqlCmd.exe')

        expect(SqlUtils.detectIPAddress('serverName', new SqlConnectionStringBuilder('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder'))).rejects;
        expect(getSqlCmdSpy).toHaveBeenCalledTimes(1);
    });

});