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
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const AzureSqlActionHelper_1 = __importDefault(require("./AzureSqlActionHelper"));
const Constants_1 = __importDefault(require("./Constants"));
class SqlUtils {
    static detectIPAddress(serverName, connectionString) {
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
                let ipAddresses = sqlCmdError.match(Constants_1.default.ipv4MatchPattern);
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
exports.default = SqlUtils;
