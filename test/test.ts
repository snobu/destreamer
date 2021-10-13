import { extractStreamGuids, parseInputFile } from '../src/Utils';
import assert from 'assert';
import tmp from 'tmp';
import fs from 'fs';
import { StreamSession, VideoUrl } from './Types';


// we cannot test groups parsing as that requires an actual session
describe('Destreamer parsing', () => {
    it('Input file to arrays of guids', async () => {
        const testSession: StreamSession = {
            AccessToken: '',
            ApiGatewayUri: '',
            ApiGatewayVersion: ''
        };
        const testIn: Array<string> = [
            'https://web.microsoftstream.com/video/xxxxxxxx-aaaa-xxxx-xxxx-xxxxxxxxxxxx',
            'https://web.microsoftstream.com/video/xxxxxxxx-bbbb-xxxx-xxxx-xxxxxxxxxxxx?',
            ' -dir = "luca"',
            'https://web.microsoftstream.com/video/xxxxxxxx-cccc-xxxx-xxxx-xxxxxxxxxxxx&',
            '',
            'https://web.microsoftstream.com/video/xxxxxxxx-dddd-xxxx-xxxx-xxxxxxxxxxxx?a=b&c',
            'https://web.microsoftstream.com/video/xxxxxxxx-eeee-xxxx-xxxx-xxxxxxxxxxxx?a',
            ' -dir =\'checking/justToSee\'',
            'https://web.microsoftstream.com/video/xxxxxxxx-ffff-xxxx-xxxx-dddddddddd',
            'https://web.microsoftstream.com/video/xxxxxx-gggg-xxxx-xxxx-xxxxxxxxxxxx',
            ''
        ];

        const expectedStreamOut: Array<VideoUrl> = [
            {
                url: 'xxxxxxxx-aaaa-xxxx-xxxx-xxxxxxxxxxxx',
                outDir: 'videos'
            },
            {
                url: 'xxxxxxxx-bbbb-xxxx-xxxx-xxxxxxxxxxxx',
                outDir: 'luca'
            },
            {
                url: 'xxxxxxxx-cccc-xxxx-xxxx-xxxxxxxxxxxx',
                outDir: 'videos'
            },
            {
                url: 'xxxxxxxx-dddd-xxxx-xxxx-xxxxxxxxxxxx',
                outDir: 'videos'
            },
            {
                url: 'xxxxxxxx-eeee-xxxx-xxxx-xxxxxxxxxxxx',
                outDir: 'videos'
            },
        ];

        const tmpFile = tmp.fileSync({ postfix: '.txt' });
        fs.writeFileSync(tmpFile.fd, testIn.join('\r\n'));

        const [testStreamUrls]: Array<Array<VideoUrl>> = parseInputFile(tmpFile.name, 'videos');

        assert.deepStrictEqual(
            await extractStreamGuids(testStreamUrls, testSession),
            expectedStreamOut,
            'Error in parsing the URLs, missmatch between test and expected'.red
        );
        // assert.deepStrictEqual(testUrlOut, expectedGUIDsOut,
        //     'Error in parsing the DIRs, missmatch between test and expected'.red);
        assert.ok('Parsing of input file ok');
    });
});
