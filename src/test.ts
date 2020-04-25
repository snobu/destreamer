import { Session } from './Types';
import { getVideoMetadata } from './Metadata';
import axios from 'axios';
import * as fs from 'fs';

const m3u8Parser = require('m3u8-parser');

const masterParser = new m3u8Parser.Parser();
const audioParser = new m3u8Parser.Parser();
const videoParser = new m3u8Parser.Parser();


export async function testAria(url: string, session: Session){

    let guid = url.split('/').pop() ?? process.exit(33);
    let metadata = await getVideoMetadata([guid], session, false);

    let master = await axios.get(metadata[0].playbackUrl,
        {
            headers:{
                Authorization: `Bearer ${session.AccessToken}`
            }
        }).then((response) => {
            return response.data;
        });

    masterParser.push(master);
    masterParser.end();
    fs.writeFileSync('test/.master.json', JSON.stringify(masterParser.manifest, undefined, 4));

    let videoUrl = masterParser.manifest.playlists.pop().uri;
    let audioUrl: string = '';
    for (let key of Object.keys(masterParser.manifest.mediaGroups.AUDIO.audio)) {
        audioUrl = masterParser.manifest.mediaGroups.AUDIO.audio[key].uri;
    }

    let video = await axios.get(videoUrl,
        {
            headers:{
                Authorization: `Bearer ${session.AccessToken}`
            }
        }).then((response) => {
            return response.data;
        });

    videoParser.push(video);
    videoParser.end();
    fs.writeFileSync('test/.video.m3u8', video);
    fs.writeFileSync('test/.video.json', JSON.stringify(videoParser.manifest, undefined, 4));

    let audio = await axios.get(audioUrl,
        {
            headers:{
                Authorization: `Bearer ${session.AccessToken}`
            }
        }).then((response) => {
            return response.data;
        });

    audioParser.push(audio);
    audioParser.end();
    fs.writeFileSync('test/.audio.m3u8', audio);
    fs.writeFileSync('test/.audio.json', JSON.stringify(audioParser.manifest, undefined, 4));

    /*
    let freshCookie = await tokenCache.RefreshToken(session);
    console.log(freshCookie)

    let keyUrl = 'https://euwe-1.api.microsoftstream.com/api/videos/7e25a619-0751-4eab-b29d-c12c850af12d/protectionKey?api-version=1.0'
    let key = await axios.get(keyUrl,
        {
            headers:{
                Authorization: `Bearer ${session.AccessToken}`
            }
        }).then((response) => {
            return response.data;
        })

    fs.writeFileSync('test/.key', key)
    */
}
