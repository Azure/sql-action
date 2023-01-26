import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import Setup from "../src/Setup";

jest.mock('@actions/core');

describe('Setup.ts tests', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    })

    it('sets up sqlcmd correctly', async () => {
        
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
        expect(cacheEvaluateVersionsSpy).toHaveBeenCalled();
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
})