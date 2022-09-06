import * as core from "@actions/core";
import * as exec from '@actions/exec';
import * as mssql from "mssql";
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
        // Clone the connection config so we can change the database without modifying the original
        const connectionConfig = JSON.parse(JSON.stringify(config.Config)) as mssql.config;
        if (useMaster) {
            connectionConfig.database = "master";
        }
        
        let sqlCmdError = '';
        try {
            core.debug(`Validating if client has access to '${connectionConfig.database}' on '${connectionConfig.server}'.`);
            let sqlCmdCall = this.buildSqlCmdCallWithConnectionInfo(config);
            sqlCmdCall += ` -Q "select getdate()"`;
            await exec.exec(sqlCmdCall, [], {
                silent: true,
                listeners: {
                    stderr: (data: Buffer) => sqlCmdError += data.toString()
                }
            });

            // If we reached here it means connection succeeded
            return {
                success: true
            };
        }
        catch (error) {
            core.debug(error);
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
        const ipAddresses = errorMessage.toString().match(Constants.ipv4MatchPattern);
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
    public static buildSqlCmdCallWithConnectionInfo(connectionConfig: SqlConnectionConfig): string {
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

        let sqlcmdCall = `"${sqlCmdPath}" -S ${connectionConfig.Config.server} -d ${connectionConfig.Config.database}`;

        // Determine the correct sqlcmd arguments based on the auth type in connectionConfig
        const authentication = connectionConfig.Config['authentication'];
        switch (authentication?.type) {
            case undefined:
                // No authentication type defaults SQL login
                sqlcmdCall += ` -U "${connectionConfig.Config.user}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, connectionConfig.Config.password);
                break;

            case 'azure-active-directory-default':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryDefault`;
                break;

            case 'azure-active-directory-password':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryPassword -U "${authentication.options.userName}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, authentication.options.password);
                break;

            case 'azure-active-directory-service-principal-secret':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryServicePrincipal -U "${connectionConfig.Config.user}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, authentication.options.clientSecret);
                break;

            default:
                throw new Error(`Authentication type ${authentication.type} is not supported.`);
        }

        return sqlcmdCall;
    }

}
