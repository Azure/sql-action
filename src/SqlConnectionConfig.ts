import * as core from '@actions/core';
import { parseSqlConnectionString } from '@tediousjs/connection-string';
import Constants from './Constants';

export default class SqlConnectionConfig {
    private _parsedConnectionString: Record<string, string | number | boolean>;
    private _rawConnectionString: string;

    constructor(connectionString: string) {
        this._validateConnectionString(connectionString);

        this._rawConnectionString = connectionString;
        this._parsedConnectionString = parseSqlConnectionString(connectionString, true, true);

        this._maskSecrets();
        this._validateconfig();
    }

    public get Server(): string {
        let server = this._parsedConnectionString['data source'] as string;
        // Remove port number
        if (server?.includes(',')) {
            server = server.split(',')[0].trim();
        }
        // Remove tcp protocol
        if (server?.startsWith('tcp:')) {
            server = server.slice(4).trim();
        }
        return server;
    }

    public get Port(): number | undefined {
        const server = this._parsedConnectionString['data source'] as string;
        if (server && server.includes(',')) {
            return parseInt(server.split(',')[1].trim());
        }
        return undefined;
    }

    public get Database(): string {
        return this._parsedConnectionString['initial catalog'] as string;
    }

    public get UserId(): string | undefined {
        return this._parsedConnectionString['user id'] as string | undefined;
    }

    public get Password(): string | undefined {
        return this._parsedConnectionString['password'] as string | undefined;
    }

    /**
     * Returns the authentication type used in the connection string, with spaces removed and in lower case.
     */
    public get FormattedAuthentication(): string | undefined {
        const auth = this._parsedConnectionString['authentication'] as string | undefined;
        return auth?.replace(/\s/g, '').toLowerCase();
    }

    /**
     * Returns the connection string escaped by double quotes.
     */
    public get EscapedConnectionString() : string {
        let result = '';

        // Isolate all the key value pairs from the raw connection string
        // Using the raw connection string instead of the parsed one to keep it as close to the original as possible
        const matches = Array.from(this._rawConnectionString.matchAll(Constants.connectionStringParserRegex));
        for (const match of matches) {
            if (match.groups) {
                const key = match.groups.key.trim();
                let val = match.groups.val.trim();

                // If the value is enclosed in double quotes, escape the double quotes
                if (val.startsWith('"') && val.endsWith('"')) {
                    val = '""' + val.slice(1, -1) + '""';
                }

                result += `${key}=${val};`;
            }
        }

        return result;
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
            throw new Error('Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes or semi-colons in the keyword value, enclose the value within quotes. Refer to this link for more info on connection string https://aka.ms/sqlconnectionstring');
        }
    }

    /**
     * Mask sensitive parts of the connection settings so they don't show up in the Github logs.
     */
    private _maskSecrets(): void {
        // User ID could be client ID in some authentication types
        if (this.UserId) {
            core.setSecret(this.UserId);
        }

        if (this.Password) {
            core.setSecret(this.Password);
        }
    }

    private _validateconfig(): void {
        if (!this.Server) {
            throw new Error(`Invalid connection string. Please ensure 'Server' or 'Data Source' is provided in the connection string.`);
        }

        if (!this.Database) {
            throw new Error(`Invalid connection string. Please ensure 'Database' or 'Initial Catalog' is provided in the connection string.`);
        }

        switch (this.FormattedAuthentication) {
            case undefined:
            case 'sqlpassword': {
                // SQL password
                if (!this.UserId) {
                    throw new Error(`Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`);
                }
                if (!this.Password) {
                    throw new Error(`Invalid connection string. Please ensure 'Password' is provided in the connection string.`);
                }
                break;
            }
            case 'activedirectorypassword': {
                if (!this.UserId) {
                    throw new Error(`Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`);
                }
                if (!this.Password) {
                    throw new Error(`Invalid connection string. Please ensure 'Password' is provided in the connection string.`);
                }
                break;
            }
            case 'activedirectoryserviceprincipal': {
                // User ID is client ID and password is secret
                if (!this.UserId) {
                    throw new Error(`Invalid connection string. Please ensure client ID is provided in the 'User' or 'User ID' field of the connection string.`);
                }
                if (!this.Password) {
                    throw new Error(`Invalid connection string. Please ensure client secret is provided in the 'Password' field of the connection string.`);
                }
                break;
            }
        }
    }
}