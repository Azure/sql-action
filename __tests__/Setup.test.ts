import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import Setup from "../src/Setup";

jest.mock('@actions/core');

describe('Setup.ts tests', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    })

    it('sets up sqlcmd correctly', async() => {
        const cacheLookupSpy = jest.spyOn(tc, 'find').mockReturnValue('');
        const downloadToolSpy = jest.spyOn(tc, 'downloadTool').mockResolvedValue('');
        const extractTarSpy = jest.spyOn(tc, 'extractTar').mockResolvedValue('');
        const extractZipSpy = jest.spyOn(tc, 'extractZip').mockResolvedValue('');
        const addPathSpy = jest.spyOn(core, 'addPath');
        const cacheDirSpy = jest.spyOn(tc, 'cacheDir').mockResolvedValue('');

        await Setup.setupSqlcmd();

        expect(cacheLookupSpy).toHaveBeenCalled();
        expect(downloadToolSpy).toHaveBeenCalled();
        if (process.platform === 'win32') {
            expect(extractZipSpy).toHaveBeenCalled();
        }
        else {
            expect(extractTarSpy).toHaveBeenCalled();
        }
        expect(addPathSpy).toHaveBeenCalled();
        expect(cacheDirSpy).toHaveBeenCalled();
    });
})