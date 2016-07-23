'use strict';

var debug = require('debug')('RARBG');
var cheerio = require('cheerio');
var _ = require('underscore');

var log = require('../logger.js');
var common = require('../common.js');

var RARBG = function () {
    this.URL = 'https://rarbg.to';
    this.TORRENT_URL = this.URL + '/torrent/{torrentId}';
    this.SEARCH_URL = this.URL + '/torrents.php?search={s}';
    this.IMDB_URL = this.URL + '/torrents.php?imdb={imdbId}';

    // status
    this.isOn = true;
};
RARBG.prototype.constructor = RARBG;

var fetchTorrent = function (html) {
    var torrent = {};

    var $ = cheerio.load(html);

    // validate the page
    if (!$('.lista-rounded').length) throw 'site validation failed (fetchTorrent)';

    // put the selector in the first result
    var selector = $('table.lista2t .lista2').first();

    torrent.torrentProvider = 'rarbg';
    torrent.torrentId = common.rem(/\/torrent\/(\w+)/, $(selector).find('a[href^="/torrent/"]').attr('href'));
    torrent.torrentName = common.unleak($(selector).find('a[href^="/torrent/"]').text());

    var url = this.TORRENT_URL.replace(/\{torrentId\}/, torrent.torrentId);

    debug(url);

    return torrent.torrentId && common.retry(url)
        .then(function (html) {
            var $ = cheerio.load(html);

            // validate the page
            if (!$('.lista-rounded').length) throw 'site validation failed (fetchTorrent:MagnetLink)';

            torrent.magnetLink = common.unleak($('.lista-rounded').find('a[href^="magnet:"]').attr('href'));

            // data validation
            if (!torrent.torrentId || !torrent.magnetLink || !common.getInfohash(torrent.magnetLink)) {
                torrent = null;
            }

            return torrent;
        });
};

var fetchInfo = function (html) {
    var info = {};

    var $ = cheerio.load(html);

    // validate the page
    if (!$('.lista-rounded').length) throw 'site validation failed (fetchInfo)';

    // put the selector in the first result
    var selector = $('table.lista2t .lista2').first();

    info.imdbId = common.rem(/\/torrent\.php\?imdb=(\w+)/, $(selector).find('a[href^="/torrents.php?imdb="]').attr('href'));

    var url = this.IMDB_URL.replace(/\{imdbId\}/, info.imdbId);

    debug(url);

    return info.imdbId && common.retry(url)
        .then(function (html) {
            var $ = cheerio.load(html);

            // validate the page
            if (!$('.lista-rounded').length) throw 'site validation failed (fetchInfo:Title)';

            info.title = common.rem(/^\s*(.+?)\s*\(/, $('.lista-rounded h1').parent().find('table td:nth-child(2)').contents().eq(2).text());

            return info.title && info;
        });
};

RARBG.prototype.fetchReleaseInfo = function (search, category, altSearch) {
    var url = this.SEARCH_URL.replace(/\{s\}/, search);

    if (category.charAt(0) == 'm')
        url += '&category=44;45&order=seeders&by=DESC';
    else
        url += '&category=41&order=seeders&by=DESC';

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(fetchInfo)
        .then(function (info) {
            if (!info && altSearch) {
                return _this.fetchReleaseInfo(altSearch, category);
            }

            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return info;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[RARBG] ', err);
            }

            return null;
        });
};

RARBG.prototype.fetch = function (releaseName, category) {
    var url = this.SEARCH_URL.replace(/\{s\}/, releaseName);

    if (category.charAt(0) == 'm')
        url += '&category=44;45&order=seeders&by=DESC';
    else
        url += '&category=41&order=seeders&by=DESC';

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(function (html) {
            return _.bind(fetchTorrent, _this)(html);
        })
        .then(function (torrent) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return torrent;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[RARBG] ', err);
            }

            return null;
        });
};

module.exports = new RARBG;
