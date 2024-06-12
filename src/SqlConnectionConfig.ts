import * as core from '@actions/core';
import Constants from './Constants';

export interface SqlConnectionString {
    server: string;
    port: number | undefined;
    database: string;
    userId: string | undefined;
    password: string | undefined;
    authentication: string | undefined;
}

export default class SqlConnectionConfig {
    private _parsedConnectionString: SqlConnectionString;    
    private _connectionString: string;

    constructor(connectionString: string) {
        this._validateConnectionString(connectionString);

        this._connectionString = connectionString;
        this._parsedConnectionString = this._parseConnectionString(connectionString);

        this._maskSecrets();
        this._validateconfig();
    }

    public get ConnectionString(): string {
        return this._connectionString;
    }
    
    public get ParsedConnectionString(): SqlConnectionString {
        return this._parsedConnectionString;
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
        if (this._parsedConnectionString.userId) {
            core.setSecret(this._parsedConnectionString.userId);
        }

        if (this._parsedConnectionString.password) {
            core.setSecret(this._parsedConnectionString.password);
        }
    }

    private _parseConnectionString(connectionString: string): SqlConnectionString {
        const result = connectionString.matchAll(Constants.connectionStringParserRegex);
        let parsedConnectionString: SqlConnectionString = {} as any;

        for (const match of result) {
            if (match.groups) {
                let key = match.groups.key.trim();
                let val = match.groups.val.trim();

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
                
                // Different parts of connection string: https://learn.microsoft.com/dotnet/api/microsoft.data.sqlclient.sqlconnection.connectionstring
                switch(key.toLowerCase()) {
                    case 'user id':
                    case 'uid': 
                    case 'user': {
                        parsedConnectionString.userId = val;
                        break;
                    }
                    case 'password':
                    case 'pwd': {
                        parsedConnectionString.password = val;
                        break;
                    }
                    case 'initial catalog':
                    case 'database': {
                        parsedConnectionString.database = val;
                        break;
                    }
                    case 'data source':
                    case 'server': 
                    case 'address':
                    case 'addr':
                    case 'network address': {
                        if (val.includes(',')) {
                            const parts = val.split(',');
                            parsedConnectionString.server = parts[0].trim();
                            parsedConnectionString.port = parseInt(parts[1].trim());
                        } else {
                            parsedConnectionString.server = val;
                        }
                        break;
                    }
                    case 'authentication': {
                        // We'll store authentication in lower case and spaces removed
                        parsedConnectionString.authentication = val.replace(/\s/g, '').toLowerCase();
                        break;
                    }
                }
            }
        }

        return parsedConnectionString;
    }

    private _validateconfig(): void {
        if (!this._parsedConnectionString.server) {
            throw new Error(`Invalid connection string. Please ensure 'Server' or 'Data Source' is provided in the connection string.`);
        }

        if (!this._parsedConnectionString.database) {
            throw new Error(`Invalid connection string. Please ensure 'Database' or 'Initial Catalog' is provided in the connection string.`);
        }

        switch (this._parsedConnectionString.authentication) {
            case undefined: 
            case 'sqlpassword': {
                // SQL password
                if (!this._parsedConnectionString.userId) {
                    throw new Error(`Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`);
                }
                if (!this._parsedConnectionString.password) {
                    throw new Error(`Invalid connection string. Please ensure 'Password' is provided in the connection string.`);
                }
                break;
            }
            case 'activedirectorypassword': {
                if (!this._parsedConnectionString.userId) {
                    throw new Error(`Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`);
                }
                if (!this._parsedConnectionString.password) {
                    throw new Error(`Invalid connection string. Please ensure 'Password' is provided in the connection string.`);
                }
                break;
            }
            case 'activedirectoryserviceprincipal': {
                // User ID is client ID and password is secret
                if (!this._parsedConnectionString.userId) {
                    throw new Error(`Invalid connection string. Please ensure client ID is provided in the 'User' or 'User ID' field of the connection string.`);
                }
                if (!this._parsedConnectionString.password) {
                    throw new Error(`Invalid connection string. Please ensure client secret is provided in the 'Password' field of the connection string.`);
                }
                break;
            }
        }
    }
}