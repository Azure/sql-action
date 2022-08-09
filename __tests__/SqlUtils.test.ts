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
        expect(mssqlSpy).toHaveBeenCalledTimes(2);
    });

    it('detectIPAddress should retry connection with DB if master connection fails', async () => {
        const mssqlSpy = jest.spyOn(mssql, 'connect').mockImplementationOnce((config) => {
            // First call, call the original to get login failure
            return mssql.connect(config);
        }).mockImplementationOnce((config) => {
            // Second call, mock return successful connection
            return new mssql.ConnectionPool('');
        });

        const ipAddress = await SqlUtils.detectIPAddress(getConnectionConfig());

        expect(mssqlSpy).toHaveBeenCalledTimes(2);
        expect(ipAddress).toBe('');
    });

    it('detectIPAddress should fail fast if initial connection fails with unknown error', async () => {
        const mssqlSpy = jest.spyOn(mssql, 'connect').mockImplementationOnce((config) => {
            if (config['database'] === 'master') {
                throw new Error('This is an unknown error.');
            }
        });

        let error: Error | undefined;
        try {
            await SqlUtils.detectIPAddress(getConnectionConfig());
        }
        catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
        expect(error!.message).toMatch('This is an unknown error.');
        expect(mssqlSpy).toHaveBeenCalledTimes(1);
    });

    it('detectIPAddress should fail if retry fails again', async () => {
        const errorSpy = jest.spyOn(core, 'error');
        const mssqlSpy = jest.spyOn(mssql, 'connect').mockImplementation((config) => {
            throw new mssql.ConnectionError(new Error('Custom connection error message.'));
        })

        let error: Error | undefined;
        try {
            await SqlUtils.detectIPAddress(getConnectionConfig());
        }
        catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
        expect(error!.message).toMatch('Failed to add firewall rule. Unable to detect client IP Address.');
        expect(mssqlSpy).toHaveBeenCalledTimes(2);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('Custom connection error message.');
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
    });
});

function getConnectionConfig(): SqlConnectionConfig {
    return new SqlConnectionConfig('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder');
}