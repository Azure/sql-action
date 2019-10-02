import { IAuthorizer } from "./Authorizer/AuthorizerFactory";
import { WebClient, WebRequest, WebResponse, WebRequestOptions } from './WebClient';

export class ApiResult {
    public error: any;
    public result: any;
    public request: any;
    public response: any;

    constructor(error: any, result?: any, request?: any, response?: any) {
        this.error = error;
        this.result = result;
        this.request = request;
        this.response = response;
    }
}

export class AzureError {
    public code: any;
    public message?: string;
    public statusCode?: number
    public details: any;
}

export interface ApiCallback {
    (error: any, result?: any, request?: any, response?: any): void
}

export function ToError(response: WebResponse): AzureError {
    let error = new AzureError();
    error.statusCode = response.statusCode;
    error.message = response.body
    
    if (response.body && response.body.error) {
        error.code = response.body.error.code;
        error.message = response.body.error.message;
        error.details = response.body.error.details;

        console.log(`##[error] ${error.message}`);
    }

    return error;
}

export interface IAzureRestClientOptions extends WebRequestOptions {
}

export default class AzureRestClient extends WebClient {

    constructor(authorizer: IAuthorizer, options?: IAzureRestClientOptions) {
        super(options);
        this._authorizer = authorizer;
    }

    public getRequestUri(uriFormat: string, parameters: {}, queryParameters?: string[], apiVersion?: string): string {
        return this.getRequestUriForbaseUrl(this._authorizer.getResourceManagerUrl(), uriFormat, parameters, queryParameters, apiVersion);
    }

    public getRequestUriForbaseUrl(baseUrl: string, uriFormat: string, parameters: {}, queryParameters?: string[], apiVersion?: string): string {
        let requestUri = baseUrl + uriFormat;
        requestUri = requestUri.replace('{subscriptionId}', encodeURIComponent(this._authorizer.getActiveSubscription()));
        for (let key in parameters) {
            requestUri = requestUri.replace(key, encodeURIComponent((<any>parameters)[key]));
        }

        // trim all duplicate forward slashes in the url
        var regex = /([^:]\/)\/+/gi;
        requestUri = requestUri.replace(regex, '$1');

        // process query paramerters
        queryParameters = queryParameters || [];
        if(!!apiVersion) {
            queryParameters.push('api-version=' + encodeURIComponent(apiVersion));
        }

        if (queryParameters.length > 0) {
            requestUri += '?' + queryParameters.join('&');
        }

        return requestUri
    }

    public async beginRequest(request: WebRequest): Promise<WebResponse> {
        let token = await this._authorizer.getToken();

        request.headers = request.headers || {};
        request.headers['Authorization'] = `Bearer ${token}`;
        request.headers['Content-Type'] = 'application/json; charset=utf-8';

        let httpResponse = await this.sendRequest(request);

        if (httpResponse.statusCode === 401 && httpResponse.body && httpResponse.body.error && httpResponse.body.error.code === "ExpiredAuthenticationToken") {
            // The access token might have expired. Re-issue the request after refreshing the token.
            token = await this._authorizer.getToken(true);
            request.headers['Authorization'] = `Bearer ${token}`;
            httpResponse = await this.sendRequest(request);
        }

        return httpResponse;
    }  

    public async accumulateResultFromPagedResult(nextLinkUrl: string): Promise<ApiResult> {
        let result: any[] = [];
        
        while (!!nextLinkUrl) {
            let nextRequest: WebRequest = {
                method: 'GET',
                uri: nextLinkUrl
            };

            let response = await this.beginRequest(nextRequest);
            if (response && response.statusCode == 200 && response.body) {
                if (response.body.value) {
                    result = result.concat(response.body.value);
                }

                nextLinkUrl = response.body.nextLink;
            }
            else {
                // forcing the compiler to assume that response will be not null or undefined
                return new ApiResult(ToError(response!));
            }
        }

        return new ApiResult(null, result);
    }

    private _authorizer: IAuthorizer;
}