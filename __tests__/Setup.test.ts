import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import Setup from "../src/Setup";

jest.mock('@actions/core');

describe('Setup.ts tests', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    })

    it('sets up sqlcmd correctly when no version is installed', async () => {
        
        const cacheLookupVersionsSpy = jest.spyOn(tc, 'findAllVersions').mockReturnValue([]);
        const cacheEvaluateVersionsSpy = jest.spyOn(tc, 'evaluateVersions').mockReturnValue('');
        const cacheLookupSpy = jest.spyOn(tc, 'find').mockReturnValue('');
        const downloadToolSpy = jest.spyOn(tc, 'downloadTool').mockResolvedValue('');
        const extractTarSpy = jest.spyOn(tc, 'extractTar').mockResolvedValue('');
        const extractZipSpy = jest.spyOn(tc, 'extractZip').mockResolvedValue('');
        const addPathSpy = jest.spyOn(core, 'addPath');
        const cacheDirSpy = jest.spyOn(tc, 'cacheDir').mockResolvedValue('');

        await Setup.setupSqlcmd();

        expect(cacheLookupVersionsSpy).toHaveBeenCalled();
        expect(cacheEvaluateVersionsSpy).not.toHaveBeenCalled();
        expect(cacheLookupSpy).not.toHaveBeenCalled();
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

    it('sets up sqlcmd correctly when sqlcmd is already in the tool cache but is a non-compatible version', async () => {

        const cacheLookupVersionsSpy = jest.spyOn(tc, 'findAllVersions').mockReturnValue(["0.9.1"]);
        const cacheEvaluateVersionsSpy = jest.spyOn(tc, 'evaluateVersions').mockReturnValue('');
        const cacheLookupSpy = jest.spyOn(tc, 'find').mockReturnValue('');
        const downloadToolSpy = jest.spyOn(tc, 'downloadTool').mockResolvedValue('');
        const extractTarSpy = jest.spyOn(tc, 'extractTar').mockResolvedValue('');
        const extractZipSpy = jest.spyOn(tc, 'extractZip').mockResolvedValue('');
        const addPathSpy = jest.spyOn(core, 'addPath');
        const cacheDirSpy = jest.spyOn(tc, 'cacheDir').mockResolvedValue('');

        await Setup.setupSqlcmd();

        expect(cacheLookupVersionsSpy).toHaveBeenCalled();
        expect(cacheEvaluateVersionsSpy).toHaveBeenCalled();
        expect(cacheLookupSpy).not.toHaveBeenCalled();
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

    it('sets up sqlcmd correctly when sqlcmd is already in the tool cache and is a compatible version', async () => {

        const cacheLookupVersionsSpy = jest.spyOn(tc, 'findAllVersions').mockReturnValue(["0.11.1"]);
        const cacheEvaluateVersionsSpy = jest.spyOn(tc, 'evaluateVersions').mockReturnValue('0.11.1');
        const cacheLookupSpy = jest.spyOn(tc, 'find').mockReturnValue('somefakepath');
        const downloadToolSpy = jest.spyOn(tc, 'downloadTool').mockResolvedValue('');
        const extractTarSpy = jest.spyOn(tc, 'extractTar').mockResolvedValue('');
        const extractZipSpy = jest.spyOn(tc, 'extractZip').mockResolvedValue('');
        const addPathSpy = jest.spyOn(core, 'addPath');
        const cacheDirSpy = jest.spyOn(tc, 'cacheDir').mockResolvedValue('');

        await Setup.setupSqlcmd();

        expect(cacheLookupVersionsSpy).toHaveBeenCalled();
        expect(cacheEvaluateVersionsSpy).toHaveBeenCalled();
        expect(cacheLookupSpy).toHaveBeenCalled();
        expect(downloadToolSpy).not.toHaveBeenCalled();
        if (process.platform === 'win32') {
            expect(extractZipSpy).not.toHaveBeenCalled();
        }
        else if (process.platform === 'linux') {
            expect(extractTarSpy).not.toHaveBeenCalled();
        }
        expect(addPathSpy).toHaveBeenCalled();
        expect(cacheDirSpy).not.toHaveBeenCalled();
    });
})