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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const exec = __importStar(require("@actions/exec"));
const core = __importStar(require("@actions/core"));
const AzureSqlActionHelper_1 = __importDefault(require("./AzureSqlActionHelper"));
const ipv4MatchPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
class FirewallManager {
    constructor(azureSqlResourceManager) {
        this._resourceManager = azureSqlResourceManager;
    }
    addFirewallRule(serverName, connectionString) {
        return __awaiter(this, void 0, void 0, function* () {
            let ipAddress = yield this._detectIPAddress(serverName, connectionString);
            if (!ipAddress) {
                core.debug(`Client has access to Sql server. Skip adding firewall exception.`);
                return;
            }
            console.log(`Client does not have access to Sql server. Adding firewall exception for client's IP address.`);
            this._firewallRule = yield this._resourceManager.addFirewallRule(ipAddress, ipAddress);
            core.debug(JSON.stringify(this._firewallRule));
            console.log(`Successfully added firewall rule ${this._firewallRule.name}.`);
        });
    }
    removeFirewallRule() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._firewallRule) {
                console.log(`Removing firewall rule '${this._firewallRule.name}'.`);
                yield this._resourceManager.removeFirewallRule(this._firewallRule);
                console.log('Successfully removed firewall rule.');
            }
        });
    }
    _detectIPAddress(serverName, connectionString) {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlCmdPath = yield AzureSqlActionHelper_1.default.getSqlCmdPath();
            let ipAddress = '';
            let sqlCmdError = '';
            try {
                core.debug(`Validating if client '${process.env.computername}' has access to Sql Server '${serverName}'.`);
                core.debug(`"${sqlCmdPath}" -S ${serverName} -U "${connectionString.userId}" -Q "select getdate()"`);
                yield exec.exec(`"${sqlCmdPath}" -S ${serverName} -U "${connectionString.userId}" -P "${connectionString.password}" -Q "select getdate()"`, [], {
                    silent: true,
                    listeners: {
                        stderr: (data) => sqlCmdError += data.toString()
                    }
                });
            }
            catch (error) {
                core.debug(sqlCmdError);
                let ipAddresses = sqlCmdError.match(ipv4MatchPattern);
                if (!!ipAddresses) {
                    ipAddress = ipAddresses[0];
                }
                else {
                    throw new Error(`Failed to add firewall rule. Unable to detect client IP Address. ${sqlCmdError} ${error}`);
                }
            }
            //ipAddress will be an empty string if client has access to SQL server
            return ipAddress;
        });
    }
}
exports.default = FirewallManager;
