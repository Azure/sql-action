import * as core from "@actions/core";
import AggregateError from "es-aggregate-error";
import * as mssql from "mssql";
import Constants from "./Constants";
import SqlConnectionConfig from "./SqlConnectionConfig";

export default class SqlUtils {
    static async detectIPAddress(connectionConfig: SqlConnectionConfig): Promise<string> {
        core.debug(`Validating if client '${process.env.computername}' has access to Sql Server '${connectionConfig.Config.server}'.`);
        let ipAddress = '';
        connectionConfig.Config.database = "master";

        // Debug
        console.log('mssql config:');
        console.dir(connectionConfig.Config);

        try {
            const pool = await mssql.connect(connectionConfig.Config);
            pool.close();
        }
        catch (connectionError) {
            // Debug
            console.log(`Caught error: `);
            console.dir(connectionError);

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

                    // There are errors that are not because of missing IP firewall rule
                    if (!ipAddress) {
                        connectionError.originalError.errors.map(e => core.error(e.message));
                        throw new Error(`Failed to add firewall rule. Unable to detect client IP Address.`);
                    }

                } else {
                    core.debug(connectionError.originalError!.message);
                    const ipAddresses = connectionError.originalError!.message.match(Constants.ipv4MatchPattern);
                    if (!!ipAddresses) {
                        ipAddress = ipAddresses[0];
                    }
                    else {
                        core.error(connectionError.message);
                        throw new Error(`Failed to add firewall rule. Unable to detect client IP Address.`);
                    }
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

}
