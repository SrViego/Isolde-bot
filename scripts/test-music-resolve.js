#!/usr/bin/env node
/**
 * Smoke test for music URL normalization (no Discord).
 * Usage: node scripts/test-music-resolve.js [query]
 */
require('dotenv').config();

const { resolveTrack, youtubeWatchUrl, isValidTrackUrl } = require('../src/systems/music');

async function main() {
  if (process.env.YT_COOKIE?.trim()) {
    console.log('YT_COOKIE loaded for test\n');
  }

  const query = process.argv[2] || 'https://youtu.be/tq0tUo0e1b8';

  console.log('youtubeWatchUrl(id):', youtubeWatchUrl('dQw4w9WgXcQ'));
  console.log('isValidTrackUrl:', isValidTrackUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));

  console.log(`\nResolving: "${query}"...\n`);
  const track = await resolveTrack(query);
  console.log(
    JSON.stringify(
      {
        title: track.title,
        url: track.url,
        videoId: track.videoId,
        durationLabel: track.durationLabel,
        hasVideoInfo: Boolean(track.videoInfo)
      },
      null,
      2
    )
  );

  if (!isValidTrackUrl(track.url)) {
    process.exitCode = 1;
    throw new Error('resolveTrack returned invalid url');
  }
  console.log('\nOK — track has valid url');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
