import * as core from "@actions/core";
import * as mssql from "mssql";
import Constants from "./Constants";
import SqlConnectionStringBuilder from "./SqlConnectionStringBuilder";

export default class SqlUtils {
    static async detectIPAddress(connectionString: SqlConnectionStringBuilder): Promise<string> {
        let ipAddress = '';

        try {
            core.debug(`Validating if client '${process.env.computername}' has access to Sql Server '${connectionString.server}'.`);
            await mssql.connect(connectionString.connectionString);
        }
        catch (error) {
            core.debug(error.message);
            const ipAddresses = error.message.match(Constants.ipv4MatchPattern);
            if (!!ipAddresses) {
                ipAddress = ipAddresses[0];
            }
            else {
                throw new Error(`Failed to add firewall rule. Unable to detect client IP Address. ${error}`)
            }
        }

        //ipAddress will be an empty string if client has access to SQL server
        return ipAddress;
    }

}
