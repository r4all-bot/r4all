'use strict';

var debug = require('debug')('KickassTorrents');
var cheerio = require('cheerio');

var log = require('../logger.js');
var common = require('../common.js');

var KickassTorrents = function () {
    this.URL = 'https://kat.cr';
    this.TORRENT_URL = this.URL + '/a-t{torrentId}.html';
    this.SEARCH_URL = this.URL + '/usearch/{s}';

    // status
    this.isOn = false; // ##
};
KickassTorrents.prototype.constructor = KickassTorrents;

var fetchTorrent = function (html, releaseName) {
    var torrent = {};

    var $ = cheerio.load(html);

    // validate the page
    if (!$('#wrapper').length) throw 'site validation failed (fetchTorrent)';

    // put the selector in the first data table (if more exists)
    var selector = $('table.data').first();

    // get the table header - 'releaseName results 1-X from X'
    var header = common.unleak($(selector).parent().children('h2').text());

    // check if there are results
    if (!$('.errorpage').length && header.match(releaseName)) {
        // put the selector in the first result
        selector = $(selector).find('.odd').first();

        torrent.torrentProvider = 'kickasstorrents';
        torrent.torrentId = parseInt(common.rem(/-t(\d+)\.html$/, $(selector).find('.cellMainLink').attr('href')));
        torrent.torrentName = common.unleak($(selector).find('.cellMainLink').text());
        torrent.magnetLink = common.unleak($(selector).find('a[href^="magnet:"]').attr('href'));
    }

    // data validation
    if (!torrent.torrentId || !torrent.magnetLink || !common.getInfohash(torrent.magnetLink)) {
        torrent = null;
    }

    return torrent;
};

var fetchInfo = function (html) {
    var $ = cheerio.load(html);

    // validate the page
    if (!$('#wrapper').length) throw 'site validation failed (fetchInfo)';

    var info = {
        title: common.unleak($('h1').text()),
        imdbId: common.rem(/imdb\.com\/title\/(tt\d+)/i, $('.torrentMediaInfo').find('a[href*="imdb.com"]').attr('href'))
    };

    return info.title && info;
};

KickassTorrents.prototype.fetchReleaseInfo = function (search, category, altSearch) {
    var url = this.SEARCH_URL.replace(/\{s\}/, search);

    // ##
    return require('bluebird').resolve(null);

    if (category.charAt(0) == 'm')
        url += ' category:Ahighres-movies/';
    else
        url += ' category:Atv/';

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
                log.error('[KickassTorrents] ', err);
            }

            return null;
        });
};

KickassTorrents.prototype.fetch = function (releaseName, category) {
    var url = this.SEARCH_URL.replace(/\{s\}/, releaseName);

    // ##
    return require('bluebird').resolve(null);

    if (category.charAt(0) == 'm')
        url += ' category:Ahighres-movies/?field=seeders&sorder=desc';
    else
        url += ' category:Atv/?field=seeders&sorder=desc';

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(function (html) {
            return fetchTorrent(html, releaseName);
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
                log.error('[KickassTorrents] ', err);
            }

            return null;
        });
};

module.exports = new KickassTorrents;
