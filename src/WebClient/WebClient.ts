import * as fs from 'fs';
import { HttpClient, HttpClientResponse } from "typed-rest-client/HttpClient";
import { RequestClient } from './requestClient';

export interface WebRequest {
    method: string;
    uri: string;
    // body can be string or ReadableStream
    body?: string | NodeJS.ReadableStream;
    headers?: any;
}

export interface WebResponse {
    statusCode: number;
    statusMessage: string;
    headers: any;
    body: any;
}

export interface WebRequestOptions {
    retriableErrorCodes?: string[];
    retryCount?: number;
    retryIntervalInSeconds?: number;
    retriableStatusCodes?: number[];
    retryRequestTimedout?: boolean;
}

export const DEFAULT_RETRIABLE_ERROR_CODES = ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ESOCKETTIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "EPIPE", "EA_AGAIN"];
export const DEFAULT_RETRIABLE_STATUS_CODES = [408, 409, 500, 502, 503, 504];

export class WebClient {

    constructor(options?: WebRequestOptions) {

        this._httpClient = RequestClient.GetInstance();

        this._webRequestOptions = options || {};
        this._webRequestOptions.retryCount = this._webRequestOptions.retryCount || 5;
        this._webRequestOptions.retryIntervalInSeconds = this._webRequestOptions.retryIntervalInSeconds || 2;
        this._webRequestOptions.retriableErrorCodes = this._webRequestOptions.retriableErrorCodes || DEFAULT_RETRIABLE_ERROR_CODES;
        this._webRequestOptions.retriableStatusCodes = this._webRequestOptions.retriableStatusCodes || DEFAULT_RETRIABLE_STATUS_CODES;
    }

    public async sendRequest(request: WebRequest): Promise<WebResponse> {

        let i = 0;
        let retryCount = this._webRequestOptions.retryCount as number; 
        let retryIntervalInSeconds = this._webRequestOptions.retryIntervalInSeconds as number;
        let retriableErrorCodes = this._webRequestOptions.retriableErrorCodes as string[];
        let retriableStatusCodes = this._webRequestOptions.retriableStatusCodes as number[];
        let timeToWait = this._webRequestOptions.retryIntervalInSeconds as number;

        while (true) {
            try {
                if (request.body && typeof(request.body) !== 'string' && !request.body["readable"]) {
                    request.body = fs.createReadStream((request as any).body["path"]);
                }

                let response: WebResponse = await this._sendRequestInternal(request);
                
                if (retriableStatusCodes.indexOf(response.statusCode) != -1 && ++i < retryCount) {
                    console.log(`Encountered a retriable status code: ${response.statusCode}. Message: '${response.statusMessage}'.`);
                    await this._sleep(timeToWait);
                    timeToWait = timeToWait * retryIntervalInSeconds + retryIntervalInSeconds;
                    continue;
                }

                return response;
            }
            catch (error) {
                if (retriableErrorCodes.indexOf(error.code) != -1 && ++i < retryCount) {
                    console.log(`Encountered a retriable error:${error.code}. Message: ${error.message}.`);
                    await this._sleep(timeToWait);
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
    }

    private async _sendRequestInternal(request: WebRequest): Promise<WebResponse> {
        console.log(`[${request.method}] ${request.uri}`);
        let response: HttpClientResponse = await this._httpClient.request(request.method, request.uri, request.body || '', request.headers);

        if (!response) {
            throw new Error(`Http request: [${request.method}] ${request.uri} returned a null Http response.`);
        }

        return await this._toWebResponse(response);
    }

    private async _toWebResponse(response: HttpClientResponse): Promise<WebResponse> { 
        let resBody;
        let body = await response.readBody();
        if (!!body) {
            try {
                resBody = JSON.parse(body);
            }
            catch (error) {
                console.log(`Could not parse response body: ${body}. Error: ${JSON.stringify(error)}`);
            }
        }

        return {
            statusCode: response.message.statusCode as number,
            statusMessage: response.message.statusMessage as string,
            headers: response.message.headers,
            body: resBody || body
        } as WebResponse;
    }

    private _sleep(sleepDurationInSeconds: number): Promise<any> {
        return new Promise((resolve) => {
            setTimeout(resolve, sleepDurationInSeconds * 1000);
        });
    }

    private _webRequestOptions: WebRequestOptions;
    private _httpClient: HttpClient;
}