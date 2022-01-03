export default class DotnetUtils {

    /***
     * Parses the string input as command line arguments, returns a dictionary where 
     * keys are argument name and values are argument values.
     * 
     * Assumes the string is a properly formatted list of arguments, where name/value pairs
     * are separated by spaces and values with spaces are enclosed by single or double quotes.
     * 
     * Example input: -o "output file" -c configuration -v 'm' --force
     * Returns: { "-o":"output file", "-c":"configuration", "-v":"m", "--force":undefined }
     */
    public static async parseCommandArguments(args: string): Promise<object> {
        let dictionary = {};

        // Regex matches dotnet build parameters: https://docs.microsoft.com/dotnet/core/tools/dotnet-build
        // \-\-?[A-Za-z\-]+     Parameter name, may have 1 or 2 dashes. Ex: -o, --verbose
        // (?:$|\s+)            Noncapture group for end of line or whitespace separating param name and value
        // (?:[^\s"'\-]+        Noncapture group start for param value, anything that's not a space, dash, or quotes
        //   |"[^"]*"|'[^']*')    ... or anything enclosed in either single or double quotes
        const matches = args.match(/(\-\-?[A-Za-z\-]+(?:$|\s+)(?:[^\s"'\-]+|"[^"]*"|'[^']*')?)/g);
        if (matches !== null) {
            for (const match in matches) {
                const whitespaceIndex = match.indexOf(' ');
                if (whitespaceIndex >= 0) {
                    // match is in the format of --paramName "param value"
                    const paramName = match.substring(0, whitespaceIndex);
                    const paramValue = match.substring(whitespaceIndex).trim();
                    dictionary[paramName] = paramValue;
                } else {
                    // match is only the param name with no value. Ex: --force, --verbose
                    dictionary[match] = undefined;
                }
            }
        }

        return dictionary;
    }

    /**
     * Looks for an argument in a dictionary of argument name/value pairs.
     * Returns the value if found, else returns undefined.
     * @param args A dictionary where keys are arg names and values are arg values.
     * @param argumentToFind The argument to look for.
     * @param alias The alias of the argument to look for.
     */
    public static async findArgument(args: object, argumentToFind: string, alias?: string): Promise<string | undefined> {
        if (alias === undefined) {
            return args[argumentToFind];
        } else {
            return args[argumentToFind] ?? args[alias];
        }
    }
}