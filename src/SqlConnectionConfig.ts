import { config, ConnectionPool } from "mssql";

export default class SqlConnectionConfig {
    private _connectionConfig: config;
    private _connectionString: string;

    constructor(connectionString: string) {
        this._connectionString = connectionString;

        try {
            this._connectionConfig = ConnectionPool.parseConnectionString(connectionString);
        } catch (error) {
            throw new Error('Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes, semi-colons in the keyword value, enclose the value within quotes. Refer this link for more info on conneciton string https://aka.ms/sqlconnectionstring');
        }
        
        this._validateconfig();
    }

    public get Config(): config {
        return this._connectionConfig;
    }

    public get ConnectionString(): string {
        return this._connectionString;
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