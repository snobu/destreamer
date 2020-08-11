import axios, { AxiosRequestConfig, AxiosResponse, AxiosInstance, AxiosError } from 'axios';
import axiosRetry, { isNetworkOrIdempotentRequestError } from 'axios-retry';
import { Session } from './Types';

export class ApiClient {
    private static instance: ApiClient;
    private axiosInstance?: AxiosInstance;
    private session?: Session;

    private constructor(session?: Session) {
        this.session = session;
        this.axiosInstance = axios.create({
            baseURL: session?.ApiGatewayUri,
            timeout: 7000,
            headers: { 'User-Agent': 'destreamer/2.0 (Hammer of Dawn)' }
        });
        axiosRetry(this.axiosInstance, {
            shouldResetTimeout: true,
            retries: 6,
            retryDelay: (retryCount) => {
                return retryCount * 2000;
            },
            retryCondition: (err: AxiosError) => {
                const retryCodes = [429, 500, 502, 503];
                if (isNetworkOrIdempotentRequestError(err)) {
                    console.warn(`${err}. Retrying request...`);

                    return true;
                }   
                console.warn(`Got HTTP ${err?.response?.status}. Retrying request...`);
                const condition = retryCodes.includes(err?.response?.status ?? 0);

                return condition;
            }
        });
    }

    public static getInstance(session?: Session): ApiClient {
        if (!ApiClient.instance) {
            ApiClient.instance = new ApiClient(session);
        }

        return ApiClient.instance;
    }

    /**
     * Call Microsoft Stream API. Base URL is sourced from
     * the session object and prepended automatically.
     */
    public async callApi(
        path: string,
        method: AxiosRequestConfig['method'] = 'get',
        payload?: any): Promise<AxiosResponse | undefined> {

        const delimiter = path.split('?').length === 1 ? '?' : '&';

        const headers: object = {
            'Authorization': 'Bearer ' + this.session?.AccessToken
        };

        return this.axiosInstance?.request({
            method: method,
            headers: headers,
            data: payload ?? undefined,
            url: path + delimiter + 'api-version=' + this.session?.ApiGatewayVersion
        });
    }

    /**
     * Call an absolute URL
     */
    public async callUrl(
        url: string,
        method: AxiosRequestConfig['method'] = 'get',
        payload?: any,
        responseType: AxiosRequestConfig['responseType'] = 'json'): Promise<AxiosResponse | undefined> {
            
        const headers: object = {
            'Authorization': 'Bearer ' + this.session?.AccessToken
        };

        return this.axiosInstance?.request({
            method: method,
            headers: headers,
            data: payload ?? undefined,
            url: url,
            responseType: responseType
        });
    }

}