/** Lazy InnerTube client (youtubei.js is ESM-only). */
let innertubePromise;

/**
 * @returns {Promise<import('youtubei.js').Innertube>}
 */
async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = (async () => {
      const { Innertube } = await import('youtubei.js');
      const cookie = process.env.YT_COOKIE?.trim();
      const options = {};
      if (cookie) {
        options.cookie = cookie;
      }
      return Innertube.create(options);
    })();
  }
  return innertubePromise;
}

module.exports = { getInnertube };
