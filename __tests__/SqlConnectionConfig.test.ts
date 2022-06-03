import * as core from '@actions/core';
import { ConnectionPool } from 'mssql';
import SqlConnectionConfig from '../src/SqlConnectionConfig';

jest.mock('@actions/core');

describe('SqlConnectionConfig tests', () => {

    describe('validate correct connection strings', () => {
        const validConnectionStrings = [
            [`Server=test1.database.windows.net;User Id=user;Password="ab'=abcdf''c;123";Initial catalog=testdb`, 'validates values enclosed with double quotes ', `ab'=abcdf''c;123`],
            [`Server=test1.database.windows.net;User Id=user;Password='abc;1""2"adf=33';Initial catalog=testdb`, 'validates values enclosed with single quotes ', `abc;1""2"adf=33`],
            [`Server=test1.database.windows.net;User Id=user;Password="abc;1""2""adf(012j^72''asj;')'=33";Initial catalog=testdb`, 'validates values beginning with double quotes and also contains escaped double quotes', `abc;1"2"adf(012j^72''asj;')'=33`],
            [`Server=test1.database.windows.net;User Id=user;Password='ab""c;1''2''"''adf("0""12j^72''asj;'')''=33';Initial catalog=testdb`, 'validates values beginning with single quotes and also contains escaped single quotes', `ab""c;1'2'"'adf("0""12j^72'asj;')'=33`],
            [`Server=test1.database.windows.net;User Id=user;Password=JustANormal123@#$password;Initial catalog=testdb`, 'validates values not beginning quotes and not containing quotes or semi-colon', `JustANormal123@#$password`],
            [`User Id=user;Password=JustANormal123@#$password;Server=test1.database.windows.net;Initial catalog=testdb`, 'validates connection string without server', `JustANormal123@#$password`]
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
            [`Server=test1.database.windows.net;User Id=user;Password="ab'=abcdf''c;123;Initial catalog=testdb`, 'validates values beginning with double quotes but not ending with double quotes'],
            [`Server=test1.database.windows.net;User Id=user;Password='abc;1""2"adf=33;Initial catalog=testdb`, 'validates values beginning with single quote but not ending with single quote'],
            [`Server=test1.database.windows.net;User Id=user;Password="abc;1""2"adf(012j^72''asj;')'=33";Initial catalog=testdb`, 'validates values enclosed in double quotes but does not escape double quotes in between'],
            [`Server=test1.database.windows.net;User Id=user;Password='ab""c;1'2''"''adf("0""12j^72''asj;'')''=33';Initial catalog=testdb`, 'validates values enclosed in single quotes but does not escape single quotes in between'],
            [`Server=test1.database.windows.net;User Id=user;Password=NotANormal123@;#$password;Initial catalog=testdb`, 'validates values not enclosed in quotes and containing semi-colon'],
            [`Server=test1.database.windows.net;Password=password;Initial catalog=testdb`, 'missing user id'],
            [`Server=test1.database.windows.net;User Id=user;Initial catalog=testdb`, 'missing password'],
            [`Server=test1.database.windows.net;User Id=user;Password=password;`, 'missing initial catalog'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='Active Directory Password';Password=password;`, 'AAD password auth missing user'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='Active Directory Password';User Id=user;`, 'AAD password auth missing password'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='SQL Password';Password=password;`, 'SQL password auth missing user'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='SQL Password';User Id=user;`, 'SQL password auth missing password']
        ];

        it.each(invalidConnectionStrings)('Input `%s` %s', (connectionString) => {
            expect(() => new SqlConnectionConfig(connectionString)).toThrow();
        })
    })

    it('should mask connection string password', () => {
        const setSecretSpy = jest.spyOn(core, 'setSecret');
        new SqlConnectionConfig('User Id=user;Password=1234;Server=test1.database.windows.net;Initial Catalog=testDB');
        expect(setSecretSpy).toHaveBeenCalled();
    });

    it('should call into mssql module to parse connection string', () => {
        const parseConnectionStringSpy = jest.spyOn(ConnectionPool, 'parseConnectionString');
        new SqlConnectionConfig('User Id=user;Password=1234;Server=test1.database.windows.net;Initial Catalog=testDB');
        expect(parseConnectionStringSpy).toHaveBeenCalled();
    });

    describe('parse AAD password auth in connection strings', () => {
        const connectionStrings = [
            [`Server=test1.database.windows.net;Database=testdb;Authentication="Active Directory Password";User Id=user;Password="abcd";`, '', '', 'Validates AAD password with double quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication='Active Directory Password';User Id=user;Password="abcd";`, '', '', 'Validates AAD password with single quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=ActiveDirectoryPassword;User Id=user;Password="abcd";`, '', '', 'Validates AAD password with one word'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Active Directory Password;User Id=user;Password=abcd;Client ID=0143b3cc-61d5-43c3-9172-0a8d003ee2bb`, '0143b3cc-61d5-43c3-9172-0a8d003ee2bb', '', 'Validates client ID'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Active Directory Password;User Id=user;Password=abcd;ClientID="0143b3cc-61d5-43c3-9172-0a8d003ee2bb"`, '0143b3cc-61d5-43c3-9172-0a8d003ee2bb', '', 'Validates client ID with quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Active Directory Password;User Id=user;Password=abcd;Tenant ID=cd8b7d43-6a5b-4a82-a828-9dd44efcd0d0`, '', 'cd8b7d43-6a5b-4a82-a828-9dd44efcd0d0', 'Validates tenant ID'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Active Directory Password;User Id=user;Password=abcd;TenantID="cd8b7d43-6a5b-4a82-a828-9dd44efcd0d0"`, '', 'cd8b7d43-6a5b-4a82-a828-9dd44efcd0d0', 'Validates tenant ID with quotes'],
            [`Server=test1.database.windows.net;Database=testdb;Authentication=Active Directory Password;User Id=user;Password=abcd;Client ID=0143b3cc-61d5-43c3-9172-0a8d003ee2bb;Tenant ID=cd8b7d43-6a5b-4a82-a828-9dd44efcd0d0`, '0143b3cc-61d5-43c3-9172-0a8d003ee2bb', 'cd8b7d43-6a5b-4a82-a828-9dd44efcd0d0', 'Validates client ID and tenant ID']
        ];

        it.each(connectionStrings)('should parse AAD password auth successfully', (connectionStringInput, clientId, tenantId) => {
            const config = new SqlConnectionConfig(connectionStringInput);
    
            expect(config.Config.server).toMatch('test1.database.windows.net');
            expect(config.Config.database).toMatch('testdb');
            expect(config.ConnectionString).toMatch(connectionStringInput);
            expect(config.Config['authentication'].type).toMatch('azure-active-directory-password');
            expect(config.Config['authentication'].options.userName).toMatch('user');
            expect(config.Config['authentication'].options.password).toMatch('abcd');

            if (clientId) expect(config.Config['authentication'].options.clientId).toMatch(clientId);
            if (tenantId) expect(config.Config['authentication'].options.tenantId).toMatch(tenantId);
        });
    })

})