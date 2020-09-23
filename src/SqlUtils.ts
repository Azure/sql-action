import * as core from "@actions/core";
import * as exec from "@actions/exec";
import AzureSqlActionHelper from "./AzureSqlActionHelper";
import Constants from "./Constants";
import SqlConnectionStringBuilder from "./SqlConnectionStringBuilder";

export default class SqlUtils {
    static async detectIPAddress(serverName: string, connectionString: SqlConnectionStringBuilder): Promise<string> {
        let sqlCmdPath = await AzureSqlActionHelper.getSqlCmdPath();
        let ipAddress = '';
        let sqlCmdError = '';
        try {
            core.debug(`Validating if client '${process.env.computername}' has access to Sql Server '${serverName}'.`);
            core.debug(`"${sqlCmdPath}" -S ${serverName} -U "${connectionString.userId}" -Q "select getdate()"`);
            await exec.exec(`"${sqlCmdPath}" -S ${serverName} -U "${connectionString.userId}" -P "${connectionString.password}" -Q "select getdate()"`, [], {
                silent: true,
                listeners: {
                    stderr: (data: Buffer) => sqlCmdError += data.toString()
                }
            });
        }
        catch (error) {
            core.debug(sqlCmdError);
            let ipAddresses = sqlCmdError.match(Constants.ipv4MatchPattern);
            if (!!ipAddresses) {
                ipAddress = ipAddresses[0];      
            }
            else {
                throw new Error(`Failed to add firewall rule. Unable to detect client IP Address. ${sqlCmdError} ${error}`)
            }
        }

        //ipAddress will be an empty string if client has access to SQL server
        return ipAddress;
    }

}
