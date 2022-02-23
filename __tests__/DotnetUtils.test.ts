import DotnetUtils from "../src/DotnetUtils";

describe('DotnetUtils tests', () => {
    it('parseCommandArguments should parse dotnet parameters', async () => {
        let dotnetParams = '';
        let parsedArgs = await DotnetUtils.parseCommandArguments(dotnetParams);
        expect(parsedArgs).toEqual({});

        dotnetParams = `-o C:\\test\\ --configuration 'Debug' --verbose --test "test value"`;
        parsedArgs = await DotnetUtils.parseCommandArguments(dotnetParams);
        expect(parsedArgs).toEqual({
            '-o': 'C:\\test\\',
            '--configuration': `'Debug'`,
            '--verbose': undefined,
            '--test': `"test value"`
        });
    });

    it ('should find arguments parsed by parseCommandArguments', async () => {
        const dotnetParams = `-o C:\\test\\ --configuration 'Debug' --verbose --test "test value"`;
        const parsedArgs = await DotnetUtils.parseCommandArguments(dotnetParams);

        expect(await DotnetUtils.findArgument(parsedArgs, '')).toEqual(undefined);
        expect(await DotnetUtils.findArgument(parsedArgs, '-o')).toEqual('C:\\test\\');
        expect(await DotnetUtils.findArgument(parsedArgs, '--output', '-o')).toEqual('C:\\test\\');
        expect(await DotnetUtils.findArgument(parsedArgs, '--configuration', '-c')).toEqual(`'Debug'`);
        expect(await DotnetUtils.findArgument(parsedArgs, '--verbose')).toEqual(undefined);
        expect(await DotnetUtils.findArgument(parsedArgs, '--test')).toEqual(`"test value"`);

        // Edge case
        expect(await DotnetUtils.findArgument({}, '')).toEqual(undefined);
    });

});