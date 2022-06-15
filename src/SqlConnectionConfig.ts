import * as core from '@actions/core';
import { config, ConnectionPool } from "mssql";
import Constants from './Constants';

/**
 * Wrapper class for the mssql.config object.
 */
export default class SqlConnectionConfig {
    private _connectionConfig: config;
    private _connectionString: string;

    constructor(connectionString: string) {
        this._validateConnectionString(connectionString);

        this._connectionString = connectionString;
        this._connectionConfig = ConnectionPool.parseConnectionString(connectionString);

        // masking the connection string password to prevent logging to console
        if (this._connectionConfig.password) {
            core.setSecret(this._connectionConfig.password);
        }

        this._setAuthentication();
        this._validateconfig();
    }

    public get Config(): config {
        return this._connectionConfig;
    }

    public get ConnectionString(): string {
        return this._connectionString;
    }

    /**
     * The basic format of a connection string includes a series of keyword/value pairs separated by semicolons. 
     * The equal sign (=) connects each keyword and its value. (Ex: Key1=Val1;Key2=Val2)
     * 
     * Following rules are to be followed while passing special characters in values:
            1. To include values that contain a semicolon, single-quote character, or double-quote character, the value must be enclosed in double quotation marks. 
            2. If the value contains both a semicolon and a double-quote character, the value can be enclosed in single quotation marks. 
            3. The single quotation mark is also useful if the value starts with a double-quote character. Conversely, the double quotation mark can be used if the value starts with a single quotation mark. 
            4. If the value contains both single-quote and double-quote characters, the quotation mark character used to enclose the value must be doubled every time it occurs within the value.
        
        Regex used by the parser(connectionStringParserRegex) to parse the VALUE:
            
            ('[^']*(''[^']*)*') -> value enclosed with single quotes and has consecutive single quotes 
            |("[^"]*(""[^"]*)*") -> value enclosed with double quotes and has consecutive double quotes
            |((?!['"])[^;]*)) -> value does not start with quotes does not contain any special character. Here we do a positive lookahead to ensure that the value doesn't start with quotes which should have been handled in previous cases
        Regex used to validate the entire connection string:
        
        A connection string is considered valid if it is a series of key/value pairs separated by semicolons. Each key/value pair must satisy the connectionStringParserRegex to ensure it is a valid key/value pair.
        ^[;\s]*{KeyValueRegex}(;[;\s]*{KeyValueRegex})*[;\s]*$
        where KeyValueRegex = ([\w\s]+=(?:('[^']*(''[^']*)*')|("[^"]*(""[^"]*)*")|((?!['"])[^;]*))))
    */
    private _validateConnectionString(connectionString: string) {
        if (!Constants.connectionStringTester.test(connectionString)) {
            throw new Error('Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes or semi-colons in the keyword value, enclose the value within quotes. Refer this link for more info on conneciton string https://aka.ms/sqlconnectionstring');
        }
    }

    private _validateconfig(): void {
        if (!this._connectionConfig.server) {
            throw new Error(`Invalid connection string. Please ensure 'Server' or 'Data Source' is provided in the connection string.`);
        }

        if (!this._connectionConfig.database) {
            throw new Error(`Invalid connection string. Please ensure 'Database' or 'Initial Catalog' is provided in the connection string.`);
        }

        const auth = this._connectionConfig['authentication'];
        switch (auth?.type) {
            case undefined: {
                // SQL password
                if (!this._connectionConfig.user) {
                    throw new Error(`Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`);
                }
                if (!this._connectionConfig.password) {
                    throw new Error(`Invalid connection string. Please ensure 'Password' is provided in the connection string.`);
                }
                break;
            }
            case 'azure-active-directory-password': {
                if (!auth.options?.userName) {
                    throw new Error(`Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`);
                }
                if (!auth.options?.password) {
                    throw new Error(`Invalid connection string. Please ensure 'Password' is provided in the connection string.`);
                }
                break;
            }
            case 'azure-active-directory-service-principal-secret': {
                if (!auth.options?.clientId) {
                    throw new Error(`Invalid connection string. Please ensure client ID is provided in the 'User' or 'User ID' field of the connection string.`);
                }
                if (!auth.options?.clientSecret) {
                    throw new Error(`Invalid connection string. Please ensure client secret is provided in the 'Password' field of the connection string.`);
                }
                break;
            }
        }
    }

    /**
     * Sets the authentication option in the mssql config object based on the connection string.
     * node-mssql currently ignores authentication when parsing the connection string: https://github.com/tediousjs/node-mssql/issues/1400
     * Assumes _connectionConfig has already been set, sets authentication to _connectionConfig directly
     */
    private _setAuthentication(): void {
        // Read client-id and tenant-id from input, and mask them
        const clientId = core.getInput('client-id') || undefined;
        if (clientId) {
            core.setSecret(clientId);
        }

        const tenantId = core.getInput('tenant-id') || undefined;
        if (tenantId) {
            core.setSecret(tenantId);
        }

        // Parsing logic from SqlConnectionStringBuilder._parseConnectionString https://github.com/Azure/sql-action/blob/7e69fdc44aba3f05fd02a6a4190841020d9ca6f7/src/SqlConnectionStringBuilder.ts#L70-L128
        const result = Array.from(this._connectionString.matchAll(Constants.connectionStringParserRegex));

        // TODO: Change this to Array.from().find() now that we're only looking for authentication
        const authentication = this._findInConnectionString(result, 'authentication');
        if (!authentication) {
            // No authentication set in connection string
            return;
        }

        // Possible auth types from connection string: https://docs.microsoft.com/sql/connect/ado-net/sql/azure-active-directory-authentication
        // Auth definitions from tedious driver: http://tediousjs.github.io/tedious/api-connection.html
        switch (authentication.replace(/\s/g, '').toLowerCase()) {
            case 'sqlpassword': {
                // default: use user and password
                break;
            }
            case 'activedirectorypassword': {
                this._connectionConfig['authentication'] = {
                    "type": 'azure-active-directory-password',
                    "options": {
                      // User and password should have been parsed already  
                      "userName": this._connectionConfig.user,
                      "password": this._connectionConfig.password,
                      "clientId": clientId,
                      "tenantId": tenantId
                    }
                }
                break;
            }
            case 'activedirectorydefault': {
                this._connectionConfig['authentication'] = {
                    type: 'azure-active-directory-default',
                    options: {
                      "clientId": clientId
                    }
                }
                break;
            }
            case 'activedirectoryserviceprincipal': {
                this._connectionConfig['authentication'] = {
                    type: 'azure-active-directory-service-principal-secret',
                    options: {
                      // From connection string, client ID == user ID and secret == password
                      // https://docs.microsoft.com/sql/connect/ado-net/sql/azure-active-directory-authentication#using-active-directory-service-principal-authentication
                      "clientId": this._connectionConfig.user,
                      "clientSecret": this._connectionConfig.password,
                      "tenantId": tenantId
                    }
                }
                break;
            }
            default: {
                throw new Error(`Authentication type '${authentication}' is not supported.`);
            }
        }
    }

    /**
     * Looks for the given key in the already parsed connection string, returns its value or undefined if not found.
     * Also processes the value to remove enclosing quotation marks. (Ex: quotes on "Active Directory Password" will be removed)
     * @param matches The connection string as a Regex Match array
     * @param findKey The key to look for in the connection string
     */
    private _findInConnectionString(matches: RegExpMatchArray[], findKey: string): string | undefined {
        for (const match of matches) {
            if (match.groups) {
                // Replace any white space in the key (Ex: User ID -> UserID)
                const key = match.groups.key.replace(/\s/g, '');
                findKey = findKey.replace(/\s/g, '');

                if (key.toLowerCase() === findKey.toLowerCase()) {
                    let val = match.groups.val;

                    /**
                     * If the first character of val is a single/double quote and there are two consecutive single/double quotes in between, 
                     * convert the consecutive single/double quote characters into one single/double quote character respectively (Point no. 4 above)
                    */
                    if (val[0] === "'") {
                        val = val.slice(1, -1);
                        val = val.replace(/''/g, "'");
                    }
                    else if (val[0] === '"') {
                        val = val.slice(1, -1);
                        val = val.replace(/""/g, '"');
                    }

                    return val;
                }
            }
        }

        return undefined;
    }
}