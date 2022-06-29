import * as core from "@actions/core";
import AggregateError from "es-aggregate-error";
import * as mssql from "mssql";
import Constants from "./Constants";
import SqlConnectionConfig from "./SqlConnectionConfig";

export default class SqlUtils {

    /**
     * Tries connection to server to determine if client IP address is restricted by the firewall.
     * First tries with master connection, and then with user DB if first one fails.
     * Returns the client IP address if firewall restriction is present, or an empty string if connection succeeds. Throws otherwise.
     */
    static async detectIPAddress(connectionConfig: SqlConnectionConfig): Promise<string> {
        // First try connection to master
        let ipAddress = await this.tryConnection(connectionConfig, true, true);
        if (ipAddress !== undefined) {
            return ipAddress;
        }

        // Retry connection with user DB
        ipAddress = await this.tryConnection(connectionConfig, false, false);
        if (ipAddress !== undefined) {
            return ipAddress;
        }
        else {
            throw new Error(`Failed to detect IP address.`);
        }
    }

    /**
     * Tries connection with the specified configuration.
     * @param config Configuration for the connection.
     * @param useMaster If true, uses "master" instead of the database specified in @param config. Every other config remains the same.
     * @param suppressError If true, will not throw connection errors. Non-connection errors will always be thrown.
     * @returns If connection succeeds, returns empty string. If connection fails due to firewall rule, returns the client's IP address.
     * Otherwise returns undefined if there were errors but were suppressed by @param suppressError.
     */
    private static async tryConnection(config: SqlConnectionConfig, useMaster: boolean, suppressError: boolean): Promise<string | undefined> {
        // Clone the connection config so we can change the database without modifying the original
        const connectionConfig = JSON.parse(JSON.stringify(config.Config)) as mssql.config;
        if (useMaster) {
            connectionConfig.database = "master";
        }

        try {
            core.debug(`Validating if client has access to '${connectionConfig.database}' on '${connectionConfig.server}'.`);
            const pool = await mssql.connect(connectionConfig);
            pool.close();
            return '';                  // Connection successful
        } 
        catch (error) {
            if (error instanceof mssql.ConnectionError) {
                const parsedIp = this.parseErrorForIpAddress(error);
                if (!!parsedIp) {
                    return parsedIp;    // Connection failed due to firewall rule, return IP address
                }
                else if (suppressError) {
                    return undefined;   // Connection failed, but suppress error and let caller handle retry
                }
                else {
                    this.reportMSSQLError(error);
                    throw new Error(`Failed to add firewall rule. Unable to detect client IP Address.`);
                }
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
     * Opens a new connection to the database and executes a T-SQL script on it.
     * @param connectionConfig Config object for the connection
     * @param command T-SQL to be executed on the connection
     */
    static async executeSql(connectionConfig: SqlConnectionConfig, command: string): Promise<void> {
        let pool: mssql.ConnectionPool | undefined;
        try {
            pool = await mssql.connect(connectionConfig.Config);
            const result = await pool.query(command);
            
            // Display result
            for (let i = 0; i < result.recordsets.length; i++) {
                console.log(`Rows affected: ${result.rowsAffected[i]}`);
                // Displays query result as JSON string. Future improvement: IRecordSet has function toTable() 
                // which returns more metadata about the query results that can be used to build a cleaner output
                console.log(`Result: ${JSON.stringify(result.recordsets[i])}`);
            }
        }
        catch (connectionError) {
            if (connectionError instanceof mssql.MSSQLError) {
                this.reportMSSQLError(connectionError);
                throw new Error('Failed to execute query.');
            }
            else {
                // Unknown error
                throw connectionError;
            }
        }
        finally {
            pool?.close();
        }
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
