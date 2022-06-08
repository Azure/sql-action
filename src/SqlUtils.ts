import * as core from "@actions/core";
import AggregateError from "es-aggregate-error";
import * as mssql from "mssql";
import Constants from "./Constants";
import SqlConnectionConfig from "./SqlConnectionConfig";

export default class SqlUtils {
    static async detectIPAddress(connectionConfig: SqlConnectionConfig): Promise<string> {
        let ipAddress = '';
        connectionConfig.Config.database = "master";

        try {
            core.debug(`Validating if client has access to SQL Server '${connectionConfig.Config.server}'.`);
            const pool = await mssql.connect(connectionConfig.Config);
            pool.close();
        }
        catch (connectionError) {
            if (connectionError instanceof mssql.ConnectionError) {
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

                // There are errors that are not because of missing IP firewall rule
                if (!ipAddress) {
                    this.reportMSSQLError(connectionError);
                    throw new Error(`Failed to add firewall rule. Unable to detect client IP Address.`);
                }
            }
            else {
                // Unknown error
                throw connectionError;
            }
        }

        //ipAddress will be an empty string if client has access to SQL server
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
            if (!!pool) pool.close();
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
