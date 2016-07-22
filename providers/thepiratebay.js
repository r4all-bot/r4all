'use strict';

var debug = require('debug')('ThePirateBay');
var cheerio = require('cheerio');

var log = require('../logger.js');
var common = require('../common.js');

var ThePirateBay = function () {
    this.URL = 'https://thepiratebay.se';
    this.TORRENT_URL = this.URL + '/torrent/{torrentId}';
    this.SEARCH_URL = this.URL + '/search/{s}';

    // status
    this.isOn = true;
};
ThePirateBay.prototype.constructor = ThePirateBay;

var fetchTorrent = function (html) {
    var torrent = {};

    var $ = cheerio.load(html);

    // validate the page
    if (!$('#SearchResults').length) throw 'site validation failed';

    // put the selector in the first result
    var selector = $('#searchResult .detName').first();

    torrent.torrentProvider = 'thepiratebay';
    torrent.torrentId = parseInt(common.rem(/\/torrent\/(\d+)/, $(selector).find('a[href^="/torrent/"]').attr('href')));
    torrent.torrentName = common.unleak($(selector).find('a[href^="/torrent/"]').text());
    torrent.magnetLink = common.unleak($(selector).parent().find('a[href^="magnet:"]').attr('href'));

    // data validation
    if (!torrent.torrentId || !torrent.magnetLink || !common.getInfohash(torrent.magnetLink)) {
        torrent = null;
    }

    return torrent;
};

ThePirateBay.prototype.fetch = function (releaseName, category) {
    var url = this.SEARCH_URL.replace(/\{s\}/, releaseName);

    if (category.charAt(0) == 'm')
        url += '/0/7/207';
    else
        url += '/0/7/208';

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(fetchTorrent)
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
                log.error('[ThePirateBay] ', err);
            }

            return null;
        });
};

module.exports = new ThePirateBay;
