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
        await mssql.connect(connectionConfig.Config, error => {
            if (!!error) {
                if (error instanceof AggregateError) {
                    // The IP address error can be anywhere inside the AggregateError
                    for (const err of error.errors) {
                        core.debug(err.message);
                        const ipAddresses = error.message.match(Constants.ipv4MatchPattern);
                        if (!!ipAddresses) {
                            ipAddress = ipAddresses[0];
                            break;
                        }
                    }

                    // There are errors that are not because of missing IP firewall rule
                    if (!ipAddress) {
                        throw new Error(`Failed to add firewall rule. Unable to detect client IP Address. ${error}`);
                    }

                } else {
                    core.debug(error.message);
                    const ipAddresses = error.message.match(Constants.ipv4MatchPattern);
                    if (!!ipAddresses) {
                        ipAddress = ipAddresses[0];
                    }
                    else {
                        throw new Error(`Failed to add firewall rule. Unable to detect client IP Address. ${error}`);
                    }
                }
            }
        });

        //ipAddress will be an empty string if client has access to SQL server
        return ipAddress;
    }

}
