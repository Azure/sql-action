import * as core from "@actions/core";
import AggregateError from 'es-aggregate-error';
import mssql from 'mssql';
import SqlUtils from "../src/SqlUtils";
import SqlConnectionConfig from '../src/SqlConnectionConfig';

describe('SqlUtils tests', () => {
    afterEach(() => {
       jest.restoreAllMocks();
    });

    it('detectIPAddress should return ipaddress', async () => {
        const mssqlSpy = jest.spyOn(mssql, 'connect').mockImplementation(() => {
            throw new mssql.ConnectionError(new Error(`Client with IP address '1.2.3.4' is not allowed to access the server.`));
        });
        const ipAddress = await SqlUtils.detectIPAddress(getConnectionConfig());

        expect(mssqlSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('1.2.3.4');
    });

    it('detectIPAddress should return ipaddress when connection returns AggregateError', async () => {
        const mssqlSpy = jest.spyOn(mssql, 'connect').mockImplementation(() => {
            const errors = new AggregateError([
                new Error(`We don't care about this error.`),
                new Error(`Client with IP address '1.2.3.4' is not allowed to access the server.`)
            ])
            throw new mssql.ConnectionError(errors);
        });
        const ipAddress = await SqlUtils.detectIPAddress(getConnectionConfig());

        expect(mssqlSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('1.2.3.4');
    });

    it('detectIPAddress should return empty', async () => {
        const mssqlSpy = jest.spyOn(mssql, 'connect').mockImplementation(() => {
            // Successful connection
            return new mssql.ConnectionPool('');
        });
        const ipAddress = await SqlUtils.detectIPAddress(getConnectionConfig());

        expect(mssqlSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('');
    });

    it('detectIPAddress should throw error', async () => {
        const mssqlSpy = jest.spyOn(mssql.ConnectionPool.prototype, 'connect').mockImplementation(() => {
            throw new mssql.ConnectionError(new Error('Failed to connect.'));
        });

        let error: Error | undefined;
        try {
            await SqlUtils.detectIPAddress(getConnectionConfig());
        }
        catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
        expect(error!.message).toMatch('Failed to add firewall rule. Unable to detect client IP Address.');
        expect(mssqlSpy).toHaveBeenCalledTimes(1);
    });

    it('should report single MSSQLError', async () => {
        const errorSpy = jest.spyOn(core, 'error');
        const error = new mssql.RequestError(new Error('Fake error'));

        await SqlUtils.reportMSSQLError(error);
        
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('Fake error');
    });

    it('should report multiple MSSQLErrors', async () => {
        const errorSpy = jest.spyOn(core, 'error');
        const aggErrors = new AggregateError([
            new Error('Fake error 1'),
            new Error('Fake error 2'),
            new Error('Fake error 3')
        ]);
        const error = new mssql.ConnectionError(aggErrors);

        await SqlUtils.reportMSSQLError(error);

        expect(errorSpy).toHaveBeenCalledTimes(3);
        expect(errorSpy).toHaveBeenNthCalledWith(1, 'Fake error 1');
        expect(errorSpy).toHaveBeenNthCalledWith(2, 'Fake error 2');
        expect(errorSpy).toHaveBeenNthCalledWith(3, 'Fake error 3');
    })

    it('should execute sql script', async () => {
        const connectionConfig = getConnectionConfig();
        const connectSpy = jest.spyOn(mssql, 'connect').mockImplementation(() => {
            // Successful connection
            return new mssql.ConnectionPool(connectionConfig.Config);
        });
        const querySpy = jest.spyOn(mssql.ConnectionPool.prototype, 'query').mockImplementation(() => {
            return {
                recordsets: [{test: "11"}, {test: "22"}],
                rowsAffected: [1, 2]
            };
        });
        const consoleSpy = jest.spyOn(console, 'log');

        await SqlUtils.executeSql(connectionConfig, 'select * from Table1');

        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(querySpy).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledTimes(4);
        expect(consoleSpy).toHaveBeenNthCalledWith(1, 'Rows affected: 1');
        expect(consoleSpy).toHaveBeenNthCalledWith(2, 'Result: {"test":"11"}');
        expect(consoleSpy).toHaveBeenNthCalledWith(3, 'Rows affected: 2');
        expect(consoleSpy).toHaveBeenNthCalledWith(4, 'Result: {"test":"22"}');
    });

    it('should fail to execute sql due to connection error', async () => {
        const connectSpy = jest.spyOn(mssql, 'connect').mockImplementation(() => {
            throw new mssql.ConnectionError(new Error('Failed to connect'));
        });
        const errorSpy = jest.spyOn(core, 'error');

        let error: Error | undefined;
        try {
            await SqlUtils.executeSql(getConnectionConfig(), 'select * from Table1');
        }
        catch (e) {
            error = e;
        }

        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect(error!.message).toMatch('Failed to execute query.');
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('Failed to connect');
    });

    it('should fail to execute sql due to request error', async () => {
        const connectSpy = jest.spyOn(mssql, 'connect').mockImplementation(() => {
            // Successful connection
            return new mssql.ConnectionPool('');
        });
        const querySpy = jest.spyOn(mssql.ConnectionPool.prototype, 'query').mockImplementation(() => {
            throw new mssql.RequestError(new Error('Failed to query'));
        })
        const errorSpy = jest.spyOn(core, 'error');

        let error: Error | undefined;
        try {
            await SqlUtils.executeSql(getConnectionConfig(), 'select * from Table1');
        }
        catch (e) {
            error = e;
        }

        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(querySpy).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect(error!.message).toMatch('Failed to execute query.');
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('Failed to query');
    });

});

function getConnectionConfig(): SqlConnectionConfig {
    return new SqlConnectionConfig('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder');
}