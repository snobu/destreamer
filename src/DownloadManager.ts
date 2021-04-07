import { ERROR_CODE } from './Errors';
import { logger } from './Logger';

import cliProgress from 'cli-progress';
import WebSocket from 'ws';


export class DownloadManager {
    // it's initalized in this.init()
    private webSocket!: WebSocket;
    private connected: boolean;
    // NOTE: is there a way to fix the ETA? Can't get size nor ETA from aria that I can see
    // we initialize this for each download
    private progresBar!: cliProgress.Bar;
    private completed: number;
    private queue: Set<string>;
    private index: number;

    public constructor() {
        this.connected = false;
        this.completed = 0;
        this.queue = new Set<string>();
        this.index = 1;

        if (!process.stdout.columns) {
            logger.warn(
                'Unable to get number of columns from terminal.\n' +
                'This happens sometimes in Cygwin/MSYS.\n' +
                'No progress bar can be rendered, however the download process should not be affected.\n\n' +
                'Please use PowerShell or cmd.exe to run destreamer on Windows.'
            );
        }
    }

    /**
     * MUST BE CALLED BEFORE ANY OTHER OPERATION
     *
     * Wait for an established connection between the webSocket
     * and Aria2c with a 10s timeout.
     * Then send aria2c the global config option if specified.
     */
    public async init(port: number, options?: { [option: string]: string }): Promise<void> {
        let socTries = 0;
        const maxTries = 10;
        let timer = 0;
        const waitTime = 20;

        const errorHanlder = async (err: WebSocket.ErrorEvent): Promise<void> => {
            // we try for 10 sec to initialize a socket on the specified port
            if (err.error.code === 'ECONNREFUSED' && socTries < maxTries) {
                logger.debug(`[DownloadMangaer] trying webSocket init ${socTries}/${maxTries}`);
                await new Promise(r => setTimeout(r, 1000));

                this.webSocket = new WebSocket(`http://localhost:${port}/jsonrpc`);
                this.webSocket.onerror = errorHanlder;
                this.webSocket.onopen = openHandler;
                socTries++;
            }
            else {
                logger.error(err);
                process.exit(ERROR_CODE.NO_CONNECT_ARIA2C);
            }
        };

        const openHandler = (event: WebSocket.OpenEvent): void => {
            this.connected = true;
            logger.debug(`[DownloadMangaer] open event recived ${event}`);
            logger.info('Connected to aria2 daemon!');
        };

        // create webSocket
        this.webSocket = new WebSocket(`http://localhost:${port}/jsonrpc`);
        this.webSocket.onerror = errorHanlder;
        this.webSocket.onopen = openHandler;


        // wait for socket connection
        while (!this.connected) {
            if (timer < waitTime) {
                timer++;
                await new Promise(r => setTimeout(r, 1000));
            }
            else {
                process.exit(ERROR_CODE.NO_CONNECT_ARIA2C);
            }
        }

        // setup messages handling
        this.webSocket.on('message', (data: WebSocket.Data) => {
            const parsed = JSON.parse(data.toString());

            // print only messaged not handled during download
            // NOTE: maybe we could remove this and re-add when the downloads are done
            if (parsed.method !== 'aria2.onDownloadComplete' &&
                parsed.method !== 'aria2.onDownloadStart' &&
                parsed.method !== 'aria2.onDownloadError' &&
                parsed.id !== 'getSpeed' &&
                parsed.id !== 'addUrl' &&
                parsed.id !== 'shutdown' &&
                parsed.id !== 'getUrlForRetry') {
                logger.info('[INCOMING] \n' + JSON.stringify(parsed, null, 4) + '\n\n');
            }
        });

        if (options) {
            logger.info('Now trying to send configs...');
            this.setOptions(options);
        }

        this.webSocket.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 'Destreamer',
            method: 'aria2.getGlobalOption'
        }));

        logger.debug('[DownloadMangaer] Setup listener count on "message": ' + this.webSocket.listenerCount('message'));
    }

    public async close(): Promise<void> {
        let exited = false;
        let timer = 0;
        const waitTime = 10;

        this.webSocket.on('message', (data: WebSocket.Data) => {
            const parsed = JSON.parse(data.toString());

            if (parsed.result === 'OK') {
                exited = true;
                logger.verbose('Aria2c shutdown complete');
            }
        });

        this.webSocket.send(this.createMessage('aria2.shutdown', null, 'shutdown'));
        this.webSocket.close();

        while ((this.webSocket.readyState !== this.webSocket.CLOSED) || !exited) {
            if (timer < waitTime) {
                timer++;
                await new Promise(r => setTimeout(r, 1000));
            }
            else {
                throw new Error();
            }
        }
    }

    private initProgresBar(): void {
        this.progresBar = new cliProgress.SingleBar({
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            format: 'progress [{bar}] {percentage}%   {speed} MB/s   {eta_formatted}',
            noTTYOutput: true,
            notTTYSchedule: 3000,
            // process.stdout.columns may return undefined in some terminals (Cygwin/MSYS)
            barsize: Math.floor((process.stdout.columns || 30) / 3),
            stopOnComplete: true,
            hideCursor: true,
        });
    }

    private createMessage(method: 'aria2.addUri', params: [[string]] | [[string], object], id?: string): string;
    private createMessage(method: 'aria2.tellStatus', params: [[string]] | [string, object], id?: string): string;
    private createMessage(method: 'aria2.changeOption', params: [string, object], id?: string): string;
    private createMessage(method: 'aria2.changeGlobalOption', params: [{ [option: string]: string }], id?: string): string;
    private createMessage(method: 'system.multicall', params: [Array<object>], id?: string): string;
    // FIXME: I don't know how to properly implement this one that doesn't require params..
    private createMessage(method: 'aria2.getGlobalStat', params?: null, id?: string): string;
    private createMessage(method: 'aria2.shutdown', params?: null, id?: string): string;
    private createMessage(method: string, params?: any, id?: string): string {
        return JSON.stringify({
            jsonrpc: '2.0',
            id: id ?? 'Destreamer',
            method: method,
            // This took 40 mins just because I didn't want to use an if...so smart -_-
            ...(!!params && { params: params })
        });
    }

    private createMulticallElement(method: string, params?: any): any {
        return {
            methodName: method,
            // This took 40 mins just because I didn't want to use an if...so smart -_-
            ...(!!params && { params: params })
        };
    }

    /**
     * For general options see
     * {@link https://aria2.github.io/manual/en/html/aria2c.html#aria2.changeOption here}.
     * For single download options see
     * {@link https://aria2.github.io/manual/en/html/aria2c.html#aria2.changeGlobalOption here}
     *
     * @param options object with key: value pairs
     */
    private setOptions(options: { [option: string]: string }, guid?: string): void {
        const message: string = guid ?
            this.createMessage('aria2.changeOption', [guid, options]) :
            this.createMessage('aria2.changeGlobalOption', [options]);

        this.webSocket.send(message);
    }

    public downloadUrls(urls: Array<string>, directory: string): Promise<void> {
        return new Promise(resolve => {

            this.index = 1;
            this.completed = 0;
            // initialize the bar as a new one
            this.initProgresBar();
            let barStarted = false;

            const handleResponse = (data: WebSocket.Data): void => {
                const parsed = JSON.parse(data.toString());

                /* I ordered them in order of (probable) times called so
                that we don't check useless ifs (even if we aren't caring about efficency) */

                // handle download completions
                if (parsed.method === 'aria2.onDownloadComplete') {
                    this.queue.delete(parsed.params.pop().gid.toString());
                    this.progresBar.update(++this.completed);

                    /* NOTE: probably we could use setIntervall because reling on
                    a completed download is good in most cases (since the segments
                    are small and a lot, somany and frequent updates) BUT if the user
                    internet speed is really low the completed downalods come in
                    less frequently and we have less updates */
                    this.webSocket.send(this.createMessage('aria2.getGlobalStat', null, 'getSpeed'));

                    if (this.queue.size === 0) {
                        this.webSocket.off('message', handleResponse);
                        logger.debug('[DownloadMangaer] End download listener count on "message": ' + this.webSocket.listenerCount('message'));
                        resolve();
                    }
                }

                // handle speed update packages
                else if (parsed.id === 'getSpeed') {
                    this.progresBar.update(this.completed,
                        { speed: ((parsed.result.downloadSpeed as number) / 1000000).toFixed(2) });
                }

                // handle download errors
                else if (parsed.method === 'aria2.onDownloadError') {
                    logger.error('Error while downloading, retrying...');

                    const errorGid: string = parsed.params.pop().gid.toString();
                    this.queue.delete(errorGid);

                    // FIXME: I don't know if it's fixed, I was not able to reproduce a fail reliably
                    this.webSocket.send(this.createMessage('aria2.tellStatus', [errorGid, ['files']], 'getUrlForRetry'));
                }

                else if (parsed.id === 'getUrlForRetry') {
                    const retryUrl = parsed.result.files[0].uris[0].uri;
                    const retryTitle = parsed.result.files[0].path;
                    this.webSocket.send(this.createMessage('aria2.addUri', [[retryUrl], { out: retryTitle }], 'addUrl'));
                }

                // handle url added to download list in aria
                else if (parsed.id === 'addUrl') {
                    // if we recive array it's the starting list of downloads
                    // if it's a single string it's an error download being re-added
                    if (typeof parsed.result === 'string') {
                        this.queue.add(parsed.result.gid.toString());
                    }
                    else if (Array.isArray(parsed.result)) {
                        parsed.result.forEach((gid: string) =>
                            this.queue.add(gid.toString())
                        );

                        if (!barStarted) {
                            barStarted = true;
                            logger.debug(`[DownloadMangaer] Starting download queue size: ${this.queue.size}`);
                            this.progresBar.start(this.queue.size, 0, { speed: 0 });
                        }
                    }
                }
            };

            // FIXME: terrible workaround for 'https://github.com/snobu/destreamer/issues/232#issuecomment-699642770' :/
            this.webSocket.removeAllListeners('message');
            this.webSocket.on('message', (data: WebSocket.Data) => {
                const parsed = JSON.parse(data.toString());
                if (parsed.method !== 'aria2.onDownloadComplete' &&
                    parsed.method !== 'aria2.onDownloadStart' &&
                    parsed.method !== 'aria2.onDownloadError' &&
                    parsed.id !== 'getSpeed' &&
                    parsed.id !== 'addUrl' &&
                    parsed.id !== 'shutdown' &&
                    parsed.id !== 'getUrlForRetry') {
                    logger.info('[INCOMING] \n' + JSON.stringify(parsed, null, 4) + '\n\n');
                }
            });
            logger.debug('[DownloadMangaer] Start download listener count on "message": ' + this.webSocket.listenerCount('message'));
            this.webSocket.on('message', data => handleResponse(data));

            const paramsForDownload: Array<any> = urls.map(url => {
                const title: string = (this.index++).toString().padStart(16, '0') + '.encr';

                return this.createMulticallElement(
                    'aria2.addUri', [[url], { out: title, dir: directory }]);
            });

            this.webSocket.send(
                this.createMessage('system.multicall', [paramsForDownload], 'addUrl')
            );
        });
    }
}
