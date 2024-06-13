import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";
import * as tc from "@actions/tool-cache";
import Setup, { sqlcmdDownloadUrl, sqlcmdFallbackVersion, sqlcmdToolName } from "../src/Setup";

jest.mock('@actions/core');

describe('Setup.ts tests', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    })

    it('sets up sqlcmd correctly', async() => {
        const headSpy = jest.spyOn(HttpClient.prototype, 'head');
        const cacheLookupSpy = jest.spyOn(tc, 'find').mockReturnValue('');
        const downloadToolSpy = jest.spyOn(tc, 'downloadTool').mockResolvedValue('');
        const extractTarSpy = jest.spyOn(tc, 'extractTar').mockResolvedValue('');
        const extractZipSpy = jest.spyOn(tc, 'extractZip').mockResolvedValue('');
        const addPathSpy = jest.spyOn(core, 'addPath');
        const cacheDirSpy = jest.spyOn(tc, 'cacheDir').mockResolvedValue('');

        await Setup.setupSqlcmd();

        expect(headSpy).toHaveBeenCalled();
        expect(cacheLookupSpy).toHaveBeenCalled();
        expect(downloadToolSpy).toHaveBeenCalled();
        if (process.platform === 'win32') {
            expect(extractZipSpy).toHaveBeenCalled();
        }
        else if (process.platform === 'linux') {
            expect(extractTarSpy).toHaveBeenCalled();
        }
        expect(addPathSpy).toHaveBeenCalled();
        expect(cacheDirSpy).toHaveBeenCalled();
    });

    it('gets the version number from the latest release', async() => {
        const headSpy = jest.spyOn(HttpClient.prototype, 'head').mockResolvedValue({
            message: {
                headers: {
                    location: 'https://github.com/microsoft/go-sqlcmd/releases/tag/v0.100.100'
                }
            }
        } as any);

        const version = await Setup.extractVersionFromLatestRelease(sqlcmdDownloadUrl);

        expect(headSpy).toHaveBeenCalled();
        expect(version).toBe('0.100.100');
    });

    it('uses fallback version when latest version cannot be determined', async() => {
        const headSpy = jest.spyOn(HttpClient.prototype, 'head').mockResolvedValue({
            message: {
                headers: {}
            }
        } as any);
        const cacheLookupSpy = jest.spyOn(tc, 'find').mockReturnValue('fake_path');

        await Setup.setupSqlcmd();

        expect(headSpy).toHaveBeenCalled();
        expect(cacheLookupSpy).toHaveBeenCalledWith(sqlcmdToolName, sqlcmdFallbackVersion);
    });
})