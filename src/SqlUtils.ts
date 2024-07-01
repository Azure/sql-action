import * as core from "@actions/core";
import * as exec from '@actions/exec';
import Constants from "./Constants";
import SqlConnectionConfig from "./SqlConnectionConfig";

export interface ConnectionResult {
    /** True if connection succeeds, false otherwise */
    success: boolean,

    /** Connection error on failure */
    errorMessage?: string,

    /** Client IP address if connection fails due to firewall rule */
    ipAddress?: string
}

export default class SqlUtils {

    /**
     * Tries connection to server to determine if client IP address is restricted by the firewall.
     * First tries with master connection, and then with user DB if first one fails.
     * @param SqlConnectionConfig The connection configuration to try.
     * @returns The client IP address if firewall restriction is present, or an empty string if connection succeeds. Throws otherwise.
     */
    static async detectIPAddress(connectionConfig: SqlConnectionConfig): Promise<string> {
        // First try connection to master
        let result = await this.tryConnection(connectionConfig, true);
        if (result.success) {
            return '';
        }
        else if (result.ipAddress) {
            return result.ipAddress;
        }

        // Retry connection with user DB
        result = await this.tryConnection(connectionConfig, false);
        if (result.success) {
            return '';
        }
        else if (result.ipAddress) {
            return result.ipAddress;
        }
        else {
            throw new Error(`Failed to add firewall rule. Unable to detect client IP Address. ${result.errorMessage}`);
        }
    }

    /**
     * Tries connection with the specified configuration.
     * @param config Configuration for the connection.
     * @param useMaster If true, uses "master" instead of the database specified in @param config. Every other config remains the same.
     * @returns A ConnectionResult object indicating success/failure, the connection on success, or the error on failure.
     */
    private static async tryConnection(config: SqlConnectionConfig, useMaster?: boolean): Promise<ConnectionResult> {
        const database = useMaster ? "master" : config.Database;
        
        let sqlCmdError = '';
        try {
            core.debug(`Validating if client has access to '${database}' on '${config.Server}'.`);
            let sqlCmdCall = this.buildSqlCmdCallWithConnectionInfo(config, database);
            sqlCmdCall += ` -Q "SELECT 'Validating connection from GitHub SQL Action'"`;
            await exec.exec(sqlCmdCall, [], {
                silent: true,
                listeners: {
                    stderr: (data: Buffer) => sqlCmdError += data.toString(),
                    // Some AAD errors come through as regular stdout. For this scenario, we will just append any stdout 
                    // to the error string since it will only be surfaced if sqlcmd actually fails.
                    stdout: (data: Buffer) => sqlCmdError += data.toString()
                }
            });

            // If we reached here it means connection succeeded
            return {
                success: true
            };
        }
        catch (error) {
            core.debug(`${error.message}`);
            core.debug(`SqlCmd stderr: ${sqlCmdError}`);
            return {
                success: false,
                errorMessage: sqlCmdError,
                ipAddress: this.parseErrorForIpAddress(sqlCmdError)
            };
        }
    }

    /**
     * Parse an error message to see if it contains an IP address.
     * Returns the IP address if found, otherwise undefined.
     */
    private static parseErrorForIpAddress(errorMessage: string): string | undefined {
        let ipAddress: string | undefined;
        const ipAddresses = errorMessage.match(Constants.ipv4MatchPattern);
        if (!!ipAddresses) {
            ipAddress = ipAddresses[0];      
        }
        return ipAddress;
    }

    /**
     * Builds the beginning of a sqlcmd command populated with the connection settings.
     * @param connectionConfig The connection settings to be used for this sqlcmd call.
     * @param database The database to connect to. If not specified, defaults to the database in the connection settings.
     * @returns A partial sqlcmd command with connection and authentication settings.
     */
    public static buildSqlCmdCallWithConnectionInfo(connectionConfig: SqlConnectionConfig, database?: string): string {
        // sqlcmd should be added to PATH already, we just need to see if need to add ".exe" for Windows
        let sqlCmdPath: string;
        switch (process.platform) {
            case "win32": 
                sqlCmdPath = "sqlcmd.exe";
                break;
            case "linux":
            case "darwin":
                sqlCmdPath = "sqlcmd";
                break;
            default:
                throw new Error(`Platform ${process.platform} is not supported.`);
        }

        if (!database) {
            database = connectionConfig.Database;
        }

        let sqlcmdCall = `"${sqlCmdPath}" -S ${connectionConfig.Server},${connectionConfig.Port ?? 1433} -d ${database}`;

        // Determine the correct sqlcmd arguments based on the auth type
        switch (connectionConfig.FormattedAuthentication) {
            case undefined:
            case 'sqlpassword':
                // No authentication type defaults SQL login
                sqlcmdCall += ` -U "${connectionConfig.UserId}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, connectionConfig.Password);
                break;

            case 'activedirectorydefault':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryDefault`;
                break;

            case 'activedirectorypassword':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryPassword -U "${connectionConfig.UserId}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, connectionConfig.Password);
                break;

            case 'activedirectoryserviceprincipal':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryServicePrincipal -U "${connectionConfig.UserId}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, connectionConfig.Password);
                break;

            default:
                throw new Error(`Authentication type ${connectionConfig.FormattedAuthentication} is not supported.`);
        }

        return sqlcmdCall;
    }

}
