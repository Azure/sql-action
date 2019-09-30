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
const fs = __importStar(require("fs"));
const requestClient_1 = require("./requestClient");
exports.DEFAULT_RETRIABLE_ERROR_CODES = ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ESOCKETTIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "EPIPE", "EA_AGAIN"];
exports.DEFAULT_RETRIABLE_STATUS_CODES = [408, 409, 500, 502, 503, 504];
class WebClient {
    constructor(options) {
        this._httpClient = requestClient_1.RequestClient.GetInstance();
        this._webRequestOptions = options || {};
        this._webRequestOptions.retryCount = this._webRequestOptions.retryCount || 5;
        this._webRequestOptions.retryIntervalInSeconds = this._webRequestOptions.retryIntervalInSeconds || 2;
        this._webRequestOptions.retriableErrorCodes = this._webRequestOptions.retriableErrorCodes || exports.DEFAULT_RETRIABLE_ERROR_CODES;
        this._webRequestOptions.retriableStatusCodes = this._webRequestOptions.retriableStatusCodes || exports.DEFAULT_RETRIABLE_STATUS_CODES;
    }
    sendRequest(request) {
        return __awaiter(this, void 0, void 0, function* () {
            let i = 0;
            let retryCount = this._webRequestOptions.retryCount;
            let retryIntervalInSeconds = this._webRequestOptions.retryIntervalInSeconds;
            let retriableErrorCodes = this._webRequestOptions.retriableErrorCodes;
            let retriableStatusCodes = this._webRequestOptions.retriableStatusCodes;
            let timeToWait = this._webRequestOptions.retryIntervalInSeconds;
            while (true) {
                try {
                    if (request.body && typeof (request.body) !== 'string' && !request.body["readable"]) {
                        request.body = fs.createReadStream(request.body["path"]);
                    }
                    let response = yield this._sendRequestInternal(request);
                    if (retriableStatusCodes.indexOf(response.statusCode) != -1 && ++i < retryCount) {
                        console.log(`Encountered a retriable status code: ${response.statusCode}. Message: '${response.statusMessage}'.`);
                        yield this._sleep(timeToWait);
                        timeToWait = timeToWait * retryIntervalInSeconds + retryIntervalInSeconds;
                        continue;
                    }
                    return response;
                }
                catch (error) {
                    if (retriableErrorCodes.indexOf(error.code) != -1 && ++i < retryCount) {
                        console.log(`Encountered a retriable error:${error.code}. Message: ${error.message}.`);
                        yield this._sleep(timeToWait);
                        timeToWait = timeToWait * retryIntervalInSeconds + retryIntervalInSeconds;
                    }
                    else {
                        if (error.code) {
                            console.log(`##[error]${error.code}`);
                        }
                        throw error;
                    }
                }
            }
        });
    }
    _sendRequestInternal(request) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`[${request.method}] ${request.uri}`);
            let response = yield this._httpClient.request(request.method, request.uri, request.body || '', request.headers);
            if (!response) {
                throw new Error(`Http request: [${request.method}] ${request.uri} returned a null Http response.`);
            }
            return yield this._toWebResponse(response);
        });
    }
    _toWebResponse(response) {
        return __awaiter(this, void 0, void 0, function* () {
            let resBody;
            let body = yield response.readBody();
            if (!!body) {
                try {
                    resBody = JSON.parse(body);
                }
                catch (error) {
                    console.log(`Could not parse response body: ${body}. Error: ${JSON.stringify(error)}`);
                }
            }
            return {
                statusCode: response.message.statusCode,
                statusMessage: response.message.statusMessage,
                headers: response.message.headers,
                body: resBody || body
            };
        });
    }
    _sleep(sleepDurationInSeconds) {
        return new Promise((resolve) => {
            setTimeout(resolve, sleepDurationInSeconds * 1000);
        });
    }
}
exports.WebClient = WebClient;
