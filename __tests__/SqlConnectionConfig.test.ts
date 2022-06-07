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
            [`Server=test1.database.windows.net;User Id=user;Password=password;`, 'missing initial catalog']
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
})