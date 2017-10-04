'use strict';

var Promise = require('bluebird');
var request = require('request').defaults({
    method: 'GET',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:53.0) Gecko/20100101 Firefox/53.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate'
    },
    timeout: 30 * 1000,
    jar: true
});
var zlib = require('zlib');
var URI = require('urijs');
var latenize = require('latenize');

var settings = require('./settings.js');

var req = function (url, options) {
    return new Promise(function (resolve, reject) {
        options = options || {};

        options.url = url;

        var r = request(options);

        r.on('response', function (res) {
            var chunks = [];

            res.on('data', function (chunk) {
                chunks.push(chunk);
            });

            res.on('end', function () {
                var buffer = Buffer.concat(chunks);
                var encoding = res.headers['content-encoding'];

                if (encoding == 'gzip') {
                    zlib.gunzip(buffer, function (err, decoded) {
                        if (err) reject(err);
                        else resolve(decoded && decoded.toString());
                    });
                } else if (encoding == 'deflate') {
                    zlib.inflate(buffer, function (err, decoded) {
                        if (err) reject(err);
                        else resolve(decoded && decoded.toString());
                    });
                } else {
                    resolve(buffer.toString());
                }
            });
        });

        r.on('error', function (err) {
            reject(err);
        });
    }).timeout(30 * 1000);
};

var common = module.exports = {
    request: function (url, options, retryAttempts) {
        retryAttempts = retryAttempts || 1;

        return new Promise(function (resolve, reject) {
            (function retry(attempt) {
                return req(url, options)
                    .then(resolve)
                    .catch(function (err) {
                        if (attempt > 0) {
                            setTimeout(function () {
                                return retry(--attempt);
                            }, settings.attemptsInterval);
                        } else {
                            return reject(err);
                        }
                    });
            })(--retryAttempts);
        });
    },

    unleak: function (str) { // cheerio+v8 "leaks" memory from original HTML
        if (typeof str === 'string') {
            return (' ' + str).substr(1);
        } else if (str === '[object Array]') {
            return str.map(this.unleak);
        } else {
            return str;
        }
    },

    rem: function (regex, str) { // regular expression match
        try {
            var match = str.match(regex);
            match.shift(); // remove original string that was parsed

            if (match.length == 1)
                return this.unleak(match[0]);
            else
                return this.unleak(match);
        } catch (err) {
            return null;
        }
    },

    getCategory: function (categoryId) {
        return categoryId;
    },

    resizeImage: function (imageUrl, providers, size) {
        if (!imageUrl) return imageUrl;

        var uri = URI(imageUrl);

        switch (uri.domain()) {
            case 'media-imdb.com':
                return providers.imdb.resizeImage(imageUrl, size);
            case 'image.tmdb.org':
                return providers.themoviedb.resizeImage(imageUrl, size);
            default:
                return imageUrl;
        }
    },

    getInfohash: function (magnetLink) {
        var infohash = magnetLink && this.rem(/magnet:\?xt=urn:btih:(\w+?)&/, magnetLink);
        return infohash && infohash.toUpperCase();
    },

    scene: {
        tags: [
            'LIMITED',
            'DC',
            'DUBBED',
            'PROPER',
            'UNRATED',
            'REPACK',
            'DOCU',
            'READNFO.PROPER',
            'SUBBED',
            'EXTENDED',
            'UNRATED.DC',
            'MIND.BENDING.EDITION',
            'REAL.PROPER',
            'RERIP',
            'READ.NFO',
            'LIMITED.INTERNAL',
            'DIRECTORS.CUT',
            'THEATRICAL.CUT',
            'THEATRICAL.VERSION',
            'DIRFIX',
            'PROPER.LIMITED',
            'EXTRAS',
            'SPECIAL.EDITION',
            'REAL',
            'UNRATED.EXTENDED',
            'LIMITED.UNRATED',
            'REMASTERED',
            'REAL.READ.NFO',
            'PROPER.UNRATED',
            'EXTENDED.CUT',
            'UNCUT.PROPER',
            'LIMITED.RERIP',
            'CANTONESE',
            'LIMITED.DOCU',
            'INTERNAL.RERIP',
            'EXTENDED.ACTION.CUT',
            'ORGINAL.CUT',
            'PART.1.EXTENDED',
            'PART.2.EXTENDED',
            'LIMITED.PROPER',
            'WS',
            'EXTENDED.RERIP',
            '30TH.ANNIVERSARY.EDITION',
            '50TH.ANNIVERSARY.SPECIAL',
            'INTERNAL',
            'REMASTERED.DC',
            'INT',
            'THEATRICAL',
            'DUBBED.LIMITED',
            'INTERNAL.REMASTERED',
            'EXTENDED.REMASTERED',
            'RERIP.LIMITED',
            'EXTENDED.REPACK',
            'READNFO.LIMITED',
            'UNCUT',
            'UNCUT.RERiP',
            'LIMITED.EXTENDED',
            'EXTENDED.LIMITED',
            'Limited.REPACK',
            'ALTERNATE.UNRATED',
            'REPACK.LIMITED',
            'REAL.REPACK'
        ],

        typeMatch: {
            m720p: '720p\\.BluRay',
            m1080p: '1080p\\.BluRay',
            s720p: '720p(?:\\.|_)(?:HDTV|WEBRip)'
        },

        getReleaseName: function (postTitle, category) {
            var regex = new RegExp(this.typeMatch[category], 'i');
            var releaseName = null;

            postTitle.split('&').some(function (r) {
                if (common.rem(regex, r) !== null) {
                    releaseName = r.trim();
                    return true;
                }

                return false;
            });

            return releaseName;
        },

        parseRelease: function (postTitle, category) {
            var releaseName = this.getReleaseName(postTitle, category);
            var parsed = null;

            if (releaseName) {
                var toMatch = this.typeMatch[category];
                var regex, result;

                if (category.charAt(0) == 'm')
                    regex = new RegExp('([\\w-.()]+?)(?:\\.(\\d{4}))?(?:\.(' + this.tags.join('|') + '))?\\.' + toMatch + '\\.x264-([\\w]+)', 'i');
                else
                    regex = new RegExp('([\\w-.()]+?)\\.S?(\\d{1,2})((?:(?:\\.|-)?(?:E|x)\\d{1,2})+)([\\w-.()]*?)\\.' + toMatch + '(?:\\.|_)x264-([\\w]+)', 'i');

                result = common.rem(regex, releaseName);

                if (result) {
                    parsed = {};

                    if (category.charAt(0) == 'm') {
                        parsed.releaseTitle = result[0].replace(/_/g, '.').toUpperCase();
                        parsed.year = result[1] && parseInt(result[1]); // year
                        parsed.tag = result[2];
                        parsed.group = result[3];
                    } else {
                        result[2] = result[2].match(/\d{1,2}/gi).map(function (ep) { // episodes array generator
                            return parseInt(ep, 10);
                        });

                        parsed.releaseTitle = result[0].replace(/_/g, '.').toUpperCase();
                        parsed.season = parseInt(result[1], 10); // season
                        parsed.episodes = [];
                        parsed.tag = result[3];
                        parsed.group = result[4];

                        for (var i = result[2][0]; i <= result[2][result[2].length - 1]; i++) { // fill in all episodes
                            parsed.episodes.push(i);
                        }
                    }
                }
            }

            return parsed;
        },

        titleEncode: function (title) {
            return latenize(title) // replace accented characters with non accented
                .replace(/&/g, 'and') // replace & for and
                .replace(/\+/g, 'plus') // replace + for plus
                .replace(/ |:|-|!|,|\//g, '.') // replace some special characters with dot
                .replace(/\.+/g, '.') // replace multiple dots with single dot
                .replace(/[^\w-.()]+/g, '') // remove not allowed characters - ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._()
                .replace(/^\./, '') // remove initial dot from string
                .replace(/\.$/, ''); // remove final dot from string
        }
    }
};
