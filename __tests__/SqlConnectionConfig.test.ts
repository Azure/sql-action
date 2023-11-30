import * as core from '@actions/core';
import { ConnectionPool } from 'mssql';
import SqlConnectionConfig from '../src/SqlConnectionConfig';

jest.mock('@actions/core');

describe('SqlConnectionConfig tests', () => {
    afterEach(() => {
       jest.restoreAllMocks();
    });

    describe('validate correct connection strings', () => {
        const validConnectionStrings = [
            [`Server=test1.database.windows.net;User Id=user;Password="placeholder'=placeholder''c;123";Initial catalog=testdb`, 'validates values enclosed with double quotes ', `placeholder'=placeholder''c;123`],
            [`Server=test1.database.windows.net;User Id=user;Password='placeholder;1""2"placeholder=33';Initial catalog=testdb`, 'validates values enclosed with single quotes ', `placeholder;1""2"placeholder=33`],
            [`Server=test1.database.windows.net;User Id=user;Password="placeholder;1""2""placeholder(012j^72''placeholder;')'=33";Initial catalog=testdb`, 'validates values beginning with double quotes and also contains escaped double quotes', `placeholder;1"2"placeholder(012j^72''placeholder;')'=33`],
            [`Server=test1.database.windows.net;User Id=user;Password='placeholder""c;1''2''"''placeholder("0""12j^72''placeholder;'')''=33';Initial catalog=testdb`, 'validates values beginning with single quotes and also contains escaped single quotes', `placeholder""c;1'2'"'placeholder("0""12j^72'placeholder;')'=33`],
            [`Server=test1.database.windows.net;User Id=user;Password=placeholder;Initial catalog=testdb`, 'validates values not beginning quotes and not containing quotes or semi-colon', `placeholder`],
            [`Server=test1.database.windows.net;Database=testdb;User Id=user;Password=placeholder;Authentication=SQL Password`, 'validates SQL password authentication', `placeholder`],
            [`Server=test1.database.windows.net;Database=testdb;User Id=user;Password=placeholder;Authentication=SQLPassword`, 'validates SQL password authentication with one word', `placeholder`],
            [`Server=test1.database.windows.net;Database=testdb;User Id=user;Password=placeholder;Authentication='SQL Password'`, 'validates SQL password authentication with quotes', `placeholder`],
        ];
    
        it.each(validConnectionStrings)('Input `%s` %s', (connectionStringInput, testDescription, passwordOutput) => {
            const connectionString = new SqlConnectionConfig(connectionStringInput);
    
            expect(connectionString.ConnectionString).toMatch(connectionStringInput);
            expect(connectionString.Config.password).toMatch(passwordOutput);
            expect(connectionString.Config.user).toMatch(`user`);
            expect(connectionString.Config.database).toMatch('testdb');
            if(!!connectionString.Config.server) expect(connectionString.Config.server).toMatch('test1.database.windows.net');
        });
    })

    describe('throw for invalid connection strings', () => {
        const invalidConnectionStrings = [
            [`Server=test1.database.windows.net;User Id=user;Password="placeholder'=placeholder''c;123;Initial catalog=testdb`, `Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes or semi-colons in the keyword value, enclose the value within quotes. Refer to this link for more info on connection string https://aka.ms/sqlconnectionstring`, 'validates values beginning with double quotes but not ending with double quotes'],
            [`Server=test1.database.windows.net;User Id=user;Password='placeholder;1""2"placeholder=33;Initial catalog=testdb`, `Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes or semi-colons in the keyword value, enclose the value within quotes. Refer to this link for more info on connection string https://aka.ms/sqlconnectionstring`, 'validates values beginning with single quote but not ending with single quote'],
            [`Server=test1.database.windows.net;User Id=user;Password="placeholder;1""2"placeholder(012j^72''placeholder;')'=33";Initial catalog=testdb`, `Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes or semi-colons in the keyword value, enclose the value within quotes. Refer to this link for more info on connection string https://aka.ms/sqlconnectionstring`, 'validates values enclosed in double quotes but does not escape double quotes in between'],
            [`Server=test1.database.windows.net;User Id=user;Password='placeholder""c;1'2''"''placeholder("0""placeholder^72''placeholder;'')''=33';Initial catalog=testdb`, `Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes or semi-colons in the keyword value, enclose the value within quotes. Refer to this link for more info on connection string https://aka.ms/sqlconnectionstring`, 'validates values enclosed in single quotes but does not escape single quotes in between'],
            [`Server=test1.database.windows.net;User Id=user;Password=placeholder@;#$placeholder;Initial catalog=testdb`, `Invalid connection string. A valid connection string is a series of keyword/value pairs separated by semi-colons. If there are any special characters like quotes or semi-colons in the keyword value, enclose the value within quotes. Refer to this link for more info on connection string https://aka.ms/sqlconnectionstring`, 'validates values not enclosed in quotes and containing semi-colon'],
            [`Server=test1.database.windows.net;Password=placeholder;Initial catalog=testdb`, `Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`, 'missing user id'],
            [`Server=test1.database.windows.net;User Id=user;Initial catalog=testdb`, `Invalid connection string. Please ensure 'Password' is provided in the connection string.`, 'missing password'],
            [`Server=test1.database.windows.net;User Id=user;Password=password;`, `Invalid connection string. Please ensure 'Database' or 'Initial Catalog' is provided in the connection string.`, 'missing initial catalog'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Fake Auth Type;Password=password;`, `Authentication type 'Fake Auth Type' is not supported.`, 'Unsupported authentication type'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='Active Directory Password';Password=password;`, `Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`, 'AAD password auth missing user'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='Active Directory Password';User Id=user;`, `Invalid connection string. Please ensure 'Password' is provided in the connection string.`, 'AAD password auth missing password'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='SQL Password';Password=password;`, `Invalid connection string. Please ensure 'User' or 'User ID' is provided in the connection string.`, 'SQL password auth missing user'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='SQL Password';User Id=user;`, `Invalid connection string. Please ensure 'Password' is provided in the connection string.`, 'SQL password auth missing password'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='ActiveDirectoryServicePrincipal';Password=placeholder;`, `Invalid connection string. Please ensure client ID is provided in the 'User' or 'User ID' field of the connection string.`, 'Service principal auth without client ID'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='ActiveDirectoryServicePrincipal';User Id=clientId;`, `Invalid connection string. Please ensure client secret is provided in the 'Password' field of the connection string.`, 'Service principal auth without client secret']
        ];

        it.each(invalidConnectionStrings)('Input `%s` %s', (connectionString, expectedError) => {
            expect(() => new SqlConnectionConfig(connectionString)).toThrow(expectedError);
        })
    })

    it('should call into mssql module to parse connection string', () => {
        const parseConnectionStringSpy = jest.spyOn(ConnectionPool, 'parseConnectionString');
        new SqlConnectionConfig('User Id=user;Password=placeholder;Server=test1.database.windows.net;Initial Catalog=testDB');
        expect(parseConnectionStringSpy).toHaveBeenCalled();
    });

    it('should mask connection string password', () => {
        const setSecretSpy = jest.spyOn(core, 'setSecret');
        new SqlConnectionConfig('User Id=user;Password=placeholder;Server=test1.database.windows.net;Initial Catalog=testDB');
        expect(setSecretSpy).toHaveBeenCalledWith('placeholder');
    });

    describe('parse authentication in connection strings', () => {
        // For ease of testing, all user/client IDs will be 'user' and password/secrets will be 'placeholder'
        const connectionStrings = [
            [`Server=test1.database.windows.net;Database=testdb;Authentication="Active Directory Password";User Id=user;Password="placeholder";`, 'azure-active-directory-password', 'Validates AAD password with double quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Active Directory Password;User Id=user;Password="placeholder";`, 'azure-active-directory-password', 'Validates AAD password with no quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='ActiveDirectoryPassword';User Id=user;Password="placeholder";`, 'azure-active-directory-password', 'Validates AAD password with one word'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication="Active Directory Service Principal";User Id=user;Password="placeholder";`, 'azure-active-directory-service-principal-secret', 'Validates AAD service principal with double quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Active Directory Service Principal;User Id=user;Password="placeholder";`, 'azure-active-directory-service-principal-secret', 'Validates AAD service principal with single quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='ActiveDirectoryServicePrincipal';User Id=user;Password="placeholder";`, 'azure-active-directory-service-principal-secret', 'Validates AAD service principal with one word'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication="Active Directory Default"`, 'azure-active-directory-default', 'Validates default AAD with double quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Active Directory Default`, 'azure-active-directory-default', 'Validates default AAD with single quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='ActiveDirectoryDefault'`, 'azure-active-directory-default', 'Validates default AAD with one word'],
        ];

        it.each(connectionStrings)('should parse different authentication types successfully', (connectionStringInput, expectedAuthType) => {
            const config = new SqlConnectionConfig(connectionStringInput);
    
            expect(config.Config.server).toMatch('test1.database.windows.net');
            expect(config.Config.database).toMatch('testdb');
            expect(config.ConnectionString).toMatch(connectionStringInput);
            expect(config.Config['authentication']).toBeDefined();
            expect(config.Config['authentication']!.type).toMatch(expectedAuthType);
            switch (expectedAuthType) {
                case 'azure-active-directory-password': {
                    expect(config.Config['authentication']!.options).toBeDefined();
                    expect(config.Config['authentication']!.options!.userName).toMatch('user');
                    expect(config.Config['authentication']!.options!.password).toMatch('placeholder');
                    break;
                }
                case 'azure-active-directory-service-principal-secret': {
                    expect(config.Config['authentication']!.options).toBeDefined();
                    expect(config.Config['authentication']!.options!.clientId).toMatch('user');
                    expect(config.Config['authentication']!.options!.clientSecret).toMatch('placeholder');
                    break;
                }
                case 'azure-active-directory-default': {
                    // AAD default uses environment variables, nothing needs to be passed in
                    break;
                }
            }
        });
    });

    describe('parse server name in connection strings', () => {
        // servernames are optionally combined with tcp prefix, port number, and servername formats
        const connectionStrings = [
            [`Server=test1.database.windows.net;Database=testdb;User Id=user;Password=placeholder;Authentication=SQLPassword`, 'test1.database.windows.net', '', 'Validates server name without prefix'],
            [`Server=tcp:test1.database.windows.net;Database=testdb;User Id=user;Password=placeholder;Authentication=SQLPassword`, 'test1.database.windows.net', '', 'Validates server name with tcp prefix'],
            [`Server=tcp:test1.database.windows.net,1433;Database=testdb;User Id=user;Password=placeholder;Authentication=SQLPassword`, 'test1.database.windows.net', '1433', 'Validates server name with tcp prefix and port'],
            [`Server=database.windows.net,1433;Database=testdb;User Id=user;Password=placeholder;Authentication=SQLPassword`, 'database.windows.net', '1433', 'Validates server name with no prefix and port'],
            [`Server=test2.20ee0ae768cc.database.windows.net,3342;Database=testdb;User Id=user;Password=placeholder;Authentication=SQLPassword`, 'test2.20ee0ae768cc.database.windows.net', '3342', 'Validates server name with no prefix and port'],
            ];
            
            it.each(connectionStrings)('should parse server name successfully', (connectionStringInput, expectedServerName, expectedPortNumber) => {
                const config = new SqlConnectionConfig(connectionStringInput);
        
                expect(config.Config.server).toMatch(expectedServerName);
                expect(config.Config.port?.toString()).toMatch(expectedPortNumber);
                expect(config.Config.database).toMatch('testdb');
                expect(config.ConnectionString).toMatch(connectionStringInput);
            });
    });
})