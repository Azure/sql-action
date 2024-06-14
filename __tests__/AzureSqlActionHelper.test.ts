import * as fs from 'fs';
import * as semver from 'semver';
import AzureSqlActionHelper from "../src/AzureSqlActionHelper";
import AzureSqlAction, { IBuildAndPublishInputs, IDacpacActionInputs, ActionType, SqlPackageAction, IActionInputs } from "../src/AzureSqlAction";
import { getInputs } from './AzureSqlAction.test';

jest.mock('fs');

describe('AzureSqlActionHelper tests', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const versions = [ // returned from sqlpackage, validated version expected
        ['162.3.563.1', '162.3.563'], // GA version
        ['162.4.101.0', '162.4.101'], // GA version
        ['162.3.562-preview', '162.3.562'], // preview version
        ['15.0.5164.1', '15.0.5164'] // old version
    ];

    // checks parsing logic used from semver
    describe('tests semver parsing for potential sqlpackage version values', () => {
        it.each(versions)('should parse %s version correctly', (versionReturned, versionExpected) => {
            let semverExpected = semver.coerce(versionExpected);
            let semverTested = semver.coerce(versionReturned);

            expect(semverTested).toEqual(semverExpected);
        });
    });

    // checks sorting logic used from semver
    describe('tests sorting of versions to select latest version', () => {
        it('should select latest version', () => {
            let versionArray: semver.SemVer[] = [];
            versions.forEach(([versionReturned, versionExpected]) => {
                versionArray.push(semver.coerce(versionReturned) ?? new semver.SemVer('0.0.0'));
            });

            let latestVersion = semver.rsort(versionArray)[0];
            let latestVersionExpected = semver.coerce(versions[1][1]);

            expect(latestVersion).toEqual(latestVersionExpected);
        });
    });


    // // ensures the sqlpackagepath input overrides the version check
    describe('sqlpackagepath input options', () => {
        const sqlpackagepaths = ['//custom/path/to/sqlpackage', 'c:/Program Files/Sqlpackage/sqlpackage'];
        it.each(sqlpackagepaths)('should return sqlpackagepath if provided', async (path) => {
            let inputs = getInputs(ActionType.DacpacAction) as IDacpacActionInputs;
            inputs.sqlpackagePath = path;

            let fileExistsSpy = jest.spyOn(fs, "existsSync");
            fileExistsSpy.mockReturnValue(true);
            let sqlpackagePath = await AzureSqlActionHelper.getSqlPackagePath(inputs);
            
            expect(fileExistsSpy).toHaveBeenCalledWith(inputs.sqlpackagePath);
            expect(sqlpackagePath).toEqual(path);
        });

        it('should not check for sqlpackagepath if no value is provided', async () => {
            const IS_WINDOWS = process.platform === 'win32';
            const IS_LINUX = process.platform === 'linux';

            let inputs = getInputs(ActionType.DacpacAction) as IDacpacActionInputs;
            inputs.sqlpackagePath = undefined;

            let fileExistsSpy = jest.spyOn(fs, "existsSync");
            let sqlpackagePath = await AzureSqlActionHelper.getSqlPackagePath(inputs);

            expect(fileExistsSpy).not.toHaveBeenCalledWith(inputs.sqlpackagePath);

            if (IS_WINDOWS) {
                expect(fileExistsSpy).toHaveBeenCalledTimes(3);
            }
            else if (IS_LINUX) {
                expect(fileExistsSpy).toHaveBeenCalledTimes(1);
            }
            else { // macos
                expect(fileExistsSpy).not.toHaveBeenCalled();
            }
        });

        it('throws if SqlPackage.exe fails to be found at user-specified location', async () => {
            let inputs = getInputs(ActionType.DacpacAction) as IDacpacActionInputs;
            let action = new AzureSqlAction(inputs);

            let getSqlPackagePathSpy = jest.spyOn(AzureSqlActionHelper, 'getSqlPackagePath').mockRejectedValue(1);

            expect(await action.execute().catch(() => null)).rejects;
            expect(getSqlPackagePathSpy).toHaveBeenCalledTimes(1);
        });
    });

});

