"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
class DotnetUtils {
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
    static parseCommandArguments(args) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    }
                    else {
                        // match is only the param name with no value. Ex: --force, --verbose
                        dictionary[match] = undefined;
                    }
                }
            }
            return dictionary;
        });
    }
    /**
     * Looks for an argument in a dictionary of argument name/value pairs.
     * Returns the value if found, else returns undefined.
     * @param args A dictionary where keys are arg names and values are arg values.
     * @param argumentToFind The argument to look for.
     * @param alias The alias of the argument to look for.
     */
    static findArgument(args, argumentToFind, alias) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (alias === undefined) {
                return args[argumentToFind];
            }
            else {
                return (_a = args[argumentToFind]) !== null && _a !== void 0 ? _a : args[alias];
            }
        });
    }
}
exports.default = DotnetUtils;
