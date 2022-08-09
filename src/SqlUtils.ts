import * as core from "@actions/core";
import AggregateError from "es-aggregate-error";
import * as mssql from "mssql";
import Constants from "./Constants";
import SqlConnectionConfig from "./SqlConnectionConfig";

export interface ConnectionResult {
    /** True if connection succeeds, false otherwise */
    success: boolean,

    /** The connection object on success */
    connection?: mssql.ConnectionPool,

    /** Connection error on failure */
    error?: mssql.ConnectionError,

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
            result.connection?.close();
            return '';
        }
        else if (result.ipAddress) {
            return result.ipAddress;
        }

        // Retry connection with user DB
        result = await this.tryConnection(connectionConfig, false);
        if (result.success) {
            result.connection?.close();
            return '';
        }
        else if (result.ipAddress) {
            return result.ipAddress;
        }
        else {
            this.reportMSSQLError(result.error!);
            throw new Error(`Failed to add firewall rule. Unable to detect client IP Address.`);
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

        try {
            core.debug(`Validating if client has access to '${connectionConfig.database}' on '${connectionConfig.server}'.`);
            const pool = await mssql.connect(connectionConfig);
            return {
                success: true,
                connection: pool
            };
        } 
        catch (error) {
            if (error instanceof mssql.ConnectionError) {
                return {
                    success: false,
                    error: error,
                    ipAddress: this.parseErrorForIpAddress(error)
                };
            }
            else {
                throw error;            // Unknown error
            }
        }
    }

    /**
     * Parse a ConnectionError to see if its message contains an IP address.
     * Returns the IP address if found, otherwise undefined.
     */
    private static parseErrorForIpAddress(connectionError: mssql.ConnectionError): string | undefined {
        let ipAddress: string | undefined;

        if (connectionError.originalError instanceof AggregateError) {
            // The IP address error can be anywhere inside the AggregateError
            for (const err of connectionError.originalError.errors) {
                core.debug(err.message);
                const ipAddresses = err.message.match(Constants.ipv4MatchPattern);
                if (!!ipAddresses) {
                    ipAddress = ipAddresses[0];
                    break;
                }
            }
        }
        else {
            core.debug(connectionError.originalError!.message);
            const ipAddresses = connectionError.originalError!.message.match(Constants.ipv4MatchPattern);
            if (!!ipAddresses) {
                ipAddress = ipAddresses[0];
            }
        }

        return ipAddress;
    }

    /**
     * Outputs the contents of a MSSQLError to the Github Action console.
     * MSSQLError may contain a single error or an AggregateError.
     */
    public static async reportMSSQLError(error: mssql.MSSQLError) {
        if (error.originalError instanceof AggregateError) {
            error.originalError.errors.map(e => core.error(e.message));
        }
        else {
            core.error(error.originalError!.message);
        }
    }

}
