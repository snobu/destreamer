import { logger } from './Logger';

import cliProgress from 'cli-progress';
import WebSocket from 'ws';

// TODO: ADD ERROR HANDLING!!!

export class DownloadManager {
    private webSocket: WebSocket;
    private progresBar: cliProgress.Bar;
    private completed: number;
    private queue: Set<string>;
    private index: number;

    public constructor(port: number) {
        this.webSocket = new WebSocket(`http://localhost:${port}/jsonrpc`);
        this.completed = 0;
        this.queue = new Set<string>();
        this.index = 1;

        // TODO: there's a not a tty mode for progresBar
        // FIXME: is there a way to fix the ETA?
        // Can't get not the size nor the ETA from aria2c that I can see
        this.progresBar = new cliProgress.SingleBar({
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            format: 'progress [{bar}] {percentage}%   {speed} MB/s   {eta_formatted}',
            // process.stdout.columns may return undefined in some terminals (Cygwin/MSYS)
            barsize: Math.floor((process.stdout.columns || 30) / 3),
            stopOnComplete: true,
            hideCursor: true,
        });

        // Is this really needed having the 30 columns default if
        // process.stdout.columns undefined/0?
        if (!process.stdout.columns) {
            logger.warn(
                'Unable to get number of columns from terminal.\n' +
                'This happens sometimes in Cygwin/MSYS.\n' +
                'No progress bar can be rendered, however the download process should not be affected.\n\n' +
                'Please use PowerShell or cmd.exe to run destreamer on Windows.'
            );
        }

        this.webSocket.on('message', data => {
            const parsed = JSON.parse(data.toString());

            // print only messaged not handled during download
            // TODO: maybe we could remove this and re-add when the downloads are done
            if (parsed.method !== 'aria2.onDownloadComplete' &&
                parsed.method !== 'aria2.onDownloadStart' &&
                parsed.id !== 'getSpeed' &&
                parsed.id !== 'addUrl') {
                logger.info('[INCOMING] \n' + JSON.stringify(parsed, null, 4) + '\n\n');
            }
        });
    }

    /**
     * MUST BE CALLED BEFORE ANY OTHER OPERATION
     *
     * Wait for an established connection between the webSocket
     * and Aria2c with a 10s timeout.
     * Then send aria2c the global config option if specified.
     */
    public async init(options?: {[option: string]: string}): Promise<void> {
        let tries = 0;

        while (this.webSocket.readyState !== this.webSocket.OPEN) {
            if (tries < 5) {
                tries++;
                await new Promise(r => setTimeout(r, 2000));
            }
            else {
                throw new Error();
            }
        }
        logger.info('Connected! \n');

        if (options) {
            logger.info('Now trying to send configs...');
            this.setOptions(options);
        }
    }

    /**
     * Wait for an established connection between the webSocket
     * and Aria2c with a 10s timeout.
     * Then send aria2c the global config option specified.
     */
    public async close(): Promise<void> {
        let tries = 0;
        this.webSocket.close();

        while (this.webSocket.readyState !== this.webSocket.CLOSED) {
            if (tries < 10) {
                tries++;
                await new Promise(r => setTimeout(r, 1000));
            }
            else {
                throw new Error();
            }
        }
    }

    private createMessage(method: 'aria2.addUri', params: [[string]] | [[string], object], id?: string): string;
    private createMessage(method: 'aria2.changeOption', params: [string, object], id?: string): string;
    private createMessage(method: 'aria2.changeGlobalOption', params: [{[option: string]: string}], id?: string): string;
    private createMessage(method: 'system.multicall', params: [Array<object>], id?: string): string;
    // FIXME: I don't know how to properly implement this one that doesn't require params..
    private createMessage(method: 'aria2.getGlobalStat', params: null, id?: string): string;
    private createMessage(method: string, params?: any, id?: string): string {
        return JSON.stringify({
            jsonrpc: '2.0',
            id: id ?? 'Destreamer',
            method: method,
            // This took 40 mins just because I didn't want to use an if...so smart -_-
            ...(!!params && {params: params})
        });
    }

    private createMulticallElement(method: string, params?: any): any {
        return {
            methodName: method,
            // This took 40 mins just because I didn't want to use an if...so smart -_-
            ...(!!params && {params: params})
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
    private setOptions(options: {[option: string]: string}, guid?: string): void {
        let message: string = guid ?
            this.createMessage('aria2.changeOption', [guid, options]) :
            this.createMessage('aria2.changeGlobalOption', [options]);

        this.webSocket.send(message);
    }

    public downloadUrls(urls: Array<string>, directory: string): Promise<void> {
        return new Promise (resolve => {

            const handleResponse = (data: WebSocket.Data): void => {
                const parsed = JSON.parse(data.toString());

                /* I ordered them in order of (probable) times called so
                that we don't check useless ifs (even if we aren't caring about efficency) */

                // handle download completions
                if (parsed.method === 'aria2.onDownloadComplete') {
                    this.queue.delete(parsed.params.pop().gid.toString());
                    this.progresBar.update(++this.completed);

                    /* TODO: probably we could use setIntervall because reling on
                    a completed download is good in most cases (since the segments
                    are small and a lot, somany and frequent updates) BUT if the user
                    internet speed is really low the completed downalods come in
                    less frequently and we have less updates */
                    this.webSocket.send(this.createMessage('aria2.getGlobalStat', null, 'getSpeed'));

                    if (this.queue.size === 0) {
                        this.index = 1;
                        this.webSocket.removeListener('message', handleResponse);
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
                    // TODO: test download error parsing
                    logger.error(JSON.stringify(parsed));

                    let errorGid: string = parsed.params.pop().gid.toString();
                    this.queue.delete(errorGid);

                    // TODO: add this to createMessage
                    this.webSocket.send(JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'getUrlForRetry',
                        method: 'aria2.getUris',
                        params: [errorGid]
                    }));
                }

                // TODO: handle download retries
                else if (parsed.id === 'getUrlForRetry') {
                    console.warn(JSON.stringify(parsed));
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

                        this.progresBar.start(this.queue.size, 0, { speed: 0});
                    }
                }
            };

            this.webSocket.on('message', data => handleResponse(data));

            const params: Array<any> = urls.map(url => {
                const title: string = (this.index++).toString().padStart(16, '0') + '.encr';

                return this.createMulticallElement(
                    'aria2.addUri', [[url], {out: title, dir: directory}]);
            });

            this.webSocket.send(
                this.createMessage('system.multicall', [params], 'addUrl')
            );
        });
    }
}
