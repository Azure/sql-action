import * as core from "@actions/core";
import * as exec from '@actions/exec';
import Constants from "./Constants";
import SqlConnectionConfig, { SqlConnectionString } from "./SqlConnectionConfig";

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
        // Clone the connection string so we can change the database without modifying the original
        const connectionString = JSON.parse(JSON.stringify(config.ParsedConnectionString)) as SqlConnectionString;
        if (useMaster) {
            connectionString.database = "master";
        }
        
        let sqlCmdError = '';
        try {
            core.debug(`Validating if client has access to '${connectionString.database}' on '${connectionString.server}'.`);
            let sqlCmdCall = this.buildSqlCmdCallWithConnectionInfo(connectionString);
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
            console.log(`${error.message}`);
            console.log(`SqlCmd stderr: ${sqlCmdError}`);
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
     * @returns A partial sqlcmd command with connection and authentication settings.
     */
    public static buildSqlCmdCallWithConnectionInfo(connectionConfig: SqlConnectionString): string {
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

        let sqlcmdCall = `"${sqlCmdPath}" -S ${connectionConfig.server},${connectionConfig.port ?? 1433} -d ${connectionConfig.database}`;

        // Determine the correct sqlcmd arguments based on the auth type
        switch (connectionConfig.authentication) {
            case undefined:
            case 'sqlpassword':
                // No authentication type defaults SQL login
                sqlcmdCall += ` -U "${connectionConfig.userId}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, connectionConfig.password);
                break;

            case 'activedirectorydefault':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryDefault`;
                break;

            case 'activedirectorypassword':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryPassword -U "${connectionConfig.userId}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, connectionConfig.password);
                break;

            case 'activedirectoryserviceprincipal':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryServicePrincipal -U "${connectionConfig.userId}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, connectionConfig.password);
                break;

            default:
                throw new Error(`Authentication type ${connectionConfig.authentication} is not supported.`);
        }

        return sqlcmdCall;
    }

}
