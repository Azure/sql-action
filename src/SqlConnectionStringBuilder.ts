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
import * as core from '@actions/core';

const connectionStringParserRegex = /(?<key>[\w\s]+)=(?<val>('[^']*(''[^']*)*')|("[^"]*(""[^"]*)*")|((?!['"])[^;]*))/g 
const connectionStringTester = /^[;\s]*([\w\s]+=(?:('[^']*(''[^']*)*')|("[^"]*(""[^"]*)*")|((?!['"])[^;]*)))(;[;\s]*([\w\s]+=(?:('[^']*(''[^']*)*')|("[^"]*(""[^"]*)*")|((?!['"])[^;]*))))*[;\s]*$/

export interface SqlConnectionString {
    server: string;
    userId: string;
    password: string;
    database: string;
    authentication: string;
}

export default class SqlConnectionStringBuilder {
    constructor(connectionString: string) {
        this._connectionString = connectionString;
        this._validateConnectionString();
        this._parsedConnectionString = this._parseConnectionString();
    }
    
    public get connectionString(): string {
        return this._connectionString;
    }

    public get userId(): string {
        return this._parsedConnectionString.userId;
    }

    public get password(): string {
        return this._parsedConnectionString.password;
    }

    public get database(): string {
        return this._parsedConnectionString.database;
    }

    public get server(): string {
        return this._parsedConnectionString.server;
    }

    private _validateConnectionString() {
        if (!connectionStringTester.test(this._connectionString)) {
            throw new Error('Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes, semi-colons in the keyword value, enclose the value within quotes. Refer this link for more info on conneciton string https://aka.ms/sqlconnectionstring');
        }
    }

    private _parseConnectionString(): SqlConnectionString {
        let result = this._connectionString.matchAll(connectionStringParserRegex);
        let parsedConnectionString: SqlConnectionString = {} as any;

        for(let match of result) {
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
                
                switch(key.toLowerCase()) {
                    case 'user id':
                    case 'uid': {
                        parsedConnectionString.userId = val; 
                        break;
                    }
                    case 'password':
                    case 'pwd': {
                        parsedConnectionString.password = val;
                        // masking the connection string password to prevent logging to console
                        core.setSecret(val);
                        break;
                    }
                    case 'initial catalog': {
                        parsedConnectionString.database = val;
                        break;
                    }
                    case 'server': {
                        parsedConnectionString.server = val;
                        break;
                    }
                    case 'authentication': {
                        parsedConnectionString.authentication = val;
                        break;
                    }
                }
            }
        }

        if (!parsedConnectionString.userId || !parsedConnectionString.password || !parsedConnectionString.database) {
            throw new Error(`Missing required keys in connection string. Please ensure that the keys 'User Id', 'Password', 'Initial Catalog' are provided in the connection string.`);
        }

        return parsedConnectionString;
    }
    
    private _connectionString: string = '';
    private _parsedConnectionString: SqlConnectionString;
}