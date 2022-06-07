import mssql from 'mssql';
import SqlUtils from "../src/SqlUtils";
import SqlConnectionConfig from '../src/SqlConnectionConfig';

describe('SqlUtils tests', () => {
    it('detectIPAddress should return ipaddress', async () => {
        const mssqlSpy = jest.spyOn(mssql.ConnectionPool.prototype, 'connect').mockImplementation((callback) => {
            callback(new mssql.ConnectionError(new Error(`Client with IP address '1.2.3.4' is not allowed to access the server.`)));
        });
        const ipAddress = await SqlUtils.detectIPAddress(new SqlConnectionConfig('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder'));

        expect(mssqlSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('1.2.3.4');
    });

    it('detectIPAddress should return empty', async () => {
        const mssqlSpy = jest.spyOn(mssql.ConnectionPool.prototype, 'connect').mockImplementation((callback) => {
            // Successful connections calls back with null error
            callback(null);
        });
        const ipAddress = await SqlUtils.detectIPAddress(new SqlConnectionConfig('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder'));

        expect(mssqlSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('');
    });

    it('detectIPAddress should throw error', () => {
        const mssqlSpy = jest.spyOn(mssql.ConnectionPool.prototype, 'connect');
        expect(SqlUtils.detectIPAddress(new SqlConnectionConfig('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder'))).rejects;
        expect(mssqlSpy).toHaveBeenCalledTimes(1);
    });

});