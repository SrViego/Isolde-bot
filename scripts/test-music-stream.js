#!/usr/bin/env node
/**
 * Resolve + stream smoke test (no Discord).
 * Usage: node scripts/test-music-stream.js [query]
 */
require('dotenv').config();

const { resolveTrack, createStreamForTrack, isValidTrackUrl } = require('../src/systems/music');

async function main() {
  if (process.env.YT_COOKIE?.trim()) {
    console.log('YT_COOKIE loaded for test\n');
  }

  const query = process.argv[2] || 'https://youtu.be/tq0tUo0e1b8';
  console.log(`Resolving: "${query}"...\n`);

  const track = await resolveTrack(query);
  console.log('track:', {
    title: track.title,
    url: track.url,
    videoId: track.videoId,
    hasVideoInfo: Boolean(track.videoInfo)
  });

  if (!isValidTrackUrl(track.url)) {
    throw new Error('resolveTrack returned invalid url');
  }

  console.log('\nOpening stream (5s)...\n');
  const streamData = await createStreamForTrack(track);
  console.log('stream type:', streamData.type);

  await new Promise((resolve, reject) => {
    let gotData = false;
    const timeout = setTimeout(() => {
      streamData.stream.destroy();
      resolve();
    }, 5000);
    streamData.stream.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    streamData.stream.on('data', () => {
      if (gotData) return;
      gotData = true;
      console.log('received audio chunk');
    });
  });

  console.log('\nOK — resolve + stream');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
