"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const core = __importStar(require("@actions/core"));
const connectionStringParserRegex = /(?<key>[\w\s]+)=(?<val>('[^']*(''[^']*)*')|("[^"]*(""[^"]*)*")|((?!['"])[^;]*))/g;
const connectionStringTester = /^[;\s]*([\w\s]+=(?:('[^']*(''[^']*)*')|("[^"]*(""[^"]*)*")|((?!['"])[^;]*)))(;[;\s]*([\w\s]+=(?:('[^']*(''[^']*)*')|("[^"]*(""[^"]*)*")|((?!['"])[^;]*))))*[;\s]*$/;
class SqlConnectionStringBuilder {
    constructor(connectionString) {
        this._connectionString = '';
        this._connectionString = connectionString;
        this._validateConnectionString();
        this._parsedConnectionString = this._parseConnectionString();
    }
    get connectionString() {
        return this._connectionString;
    }
    get userId() {
        return this._parsedConnectionString.userId;
    }
    get password() {
        return this._parsedConnectionString.password;
    }
    get database() {
        return this._parsedConnectionString.database;
    }
    get server() {
        return this._parsedConnectionString.server;
    }
    _validateConnectionString() {
        if (!connectionStringTester.test(this._connectionString)) {
            throw new Error('Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes, semi-colons in the keyword value, enclose the value within quotes. Refer this link for more info on conneciton string https://aka.ms/sqlconnectionstring');
        }
    }
    _parseConnectionString() {
        let result = this._connectionString.matchAll(connectionStringParserRegex);
        let parsedConnectionString = {};
        for (let match of result) {
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
                switch (key.toLowerCase()) {
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
}
exports.default = SqlConnectionStringBuilder;
