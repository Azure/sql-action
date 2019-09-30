"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const exec = __importStar(require("@actions/exec"));
const io = __importStar(require("@actions/io"));
class AzureCLIAuthorizer {
    constructor() {
        this._token = '';
        this._subscriptionId = '';
        this._cloudSuffixes = {};
        this._cloudEndpoints = {};
    }
    static getAuthorizer() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._authorizer) {
                this._authorizer = new AzureCLIAuthorizer();
                yield this._authorizer.validateAndSetDefaults();
            }
            return this._authorizer;
        });
    }
    validateAndSetDefaults() {
        return __awaiter(this, void 0, void 0, function* () {
            let azAccountDetails = JSON.parse(yield this._executeAzCliCommand('account show'));
            let azCloudDetails = JSON.parse(yield this._executeAzCliCommand('cloud show'));
            this._subscriptionId = azAccountDetails['id'];
            this._cloudSuffixes = azCloudDetails['suffixes'];
            this._cloudEndpoints = azCloudDetails['endpoints'];
        });
    }
    getToken(force) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._token || force) {
                try {
                    let azAccessToken = JSON.parse(yield this._executeAzCliCommand('account get-access-token'));
                    console.log(`::add-mask::${azAccessToken}`);
                    this._token = azAccessToken['accessToken'];
                }
                catch (error) {
                    console.log('Failed to fetch Azure access token');
                    throw error;
                }
            }
            return this._token;
        });
    }
    getActiveSubscription() {
        return this._subscriptionId;
    }
    getResourceManagerUrl() {
        return this._cloudEndpoints['resourceManager'] || 'https://management.azure.com/';
    }
    getCloudSuffixUrl(suffixName) {
        return this._cloudSuffixes[suffixName];
    }
    getCloudEndpointUrl(endpointName) {
        return this._cloudEndpoints[endpointName];
    }
    _executeAzCliCommand(command) {
        return __awaiter(this, void 0, void 0, function* () {
            let stdout = '';
            let azCliPath = yield io.which('az', true);
            yield exec.exec(`"${azCliPath}" ${command}`, [], {
                silent: true,
                listeners: {
                    stdout: (data) => {
                        stdout += data.toString();
                    }
                }
            });
            return stdout;
        });
    }
}
exports.AzureCLIAuthorizer = AzureCLIAuthorizer;
