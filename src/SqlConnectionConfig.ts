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

        if (!this._connectionConfig.user) {
            throw new Error(`Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`);
        }

        if (!this._connectionConfig.password) {
            throw new Error(`Invalid connection string. Please ensure 'Password' is provided in the connection string.`);
        }
    }
}