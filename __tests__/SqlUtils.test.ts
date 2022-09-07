import * as exec from "@actions/exec";
import SqlUtils from "../src/SqlUtils";
import SqlConnectionConfig from '../src/SqlConnectionConfig';

describe('SqlUtils tests', () => {
    afterEach(() => {
       jest.restoreAllMocks();
    });

    it('detectIPAddress should return ipaddress', async () => {
        const execSpy = jest.spyOn(exec, 'exec').mockImplementation((_commandLine, _args, options) => {
            let sqlClientError = `Client with IP address '1.2.3.4' is not allowed to access the server.`;
            options!.listeners!.stderr!(Buffer.from(sqlClientError));
            return Promise.reject(1);
        });
        const ipAddress = await SqlUtils.detectIPAddress(getConnectionConfig());

        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('1.2.3.4');
    });

    it('detectIPAddress should return empty', async () => {
        const execSpy = jest.spyOn(exec, 'exec').mockResolvedValue(0);
        const ipAddress = await SqlUtils.detectIPAddress(getConnectionConfig());

        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(ipAddress).toBe('');
    });

    it('detectIPAddress should throw error', async () => {
        const execSpy = jest.spyOn(exec, 'exec').mockRejectedValue(1);
        let error: Error | undefined;
        try {
            await SqlUtils.detectIPAddress(getConnectionConfig());
        }
        catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
        expect(error!.message).toMatch('Failed to add firewall rule. Unable to detect client IP Address.');
        expect(execSpy).toHaveBeenCalledTimes(2);
    });

    it('detectIPAddress should retry connection with DB if master connection fails', async () => {
        // Mock failure on first call and success on subsequent
        const execSpy = jest.spyOn(exec, 'exec').mockRejectedValueOnce(1).mockResolvedValue(0);

        const ipAddress = await SqlUtils.detectIPAddress(getConnectionConfig());

        expect(execSpy).toHaveBeenCalledTimes(2);
        expect(ipAddress).toBe('');
    });

    it('detectIPAddress should fail if retry fails again', async () => {
        const execSpy = jest.spyOn(exec, 'exec').mockRejectedValueOnce(1).mockImplementation((_commandLine, _args, options) => {
            options!.listeners!.stderr!(Buffer.from('Custom connection error message.'));
            return Promise.reject(1);
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
        expect(execSpy).toHaveBeenCalledTimes(2);
    });
});

function getConnectionConfig(): SqlConnectionConfig {
    return new SqlConnectionConfig('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder');
}