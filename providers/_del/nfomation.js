'use strict';

var debug = require('debug')('NFOmation');
var cheerio = require('cheerio');

var log = require('../logger.js');
var common = require('../common.js');

var NFOmation = function () {
    this.URL = 'http://nfomation.net';
    this.NFO_URL = this.URL + '/info/{nfo}';
    this.NFO_IMAGE_URL = this.URL + '/nfo.white/{nfo}';

    // status
    this.isOn = true;
};
NFOmation.prototype.constructor = NFOmation;

var fetchIMDB = function (html) {
    var $ = cheerio.load(html);

    // validate the page
    if (!$('#container').length) throw 'site validation failed';

    return common.rem(/imdb\.com\/title\/(tt\d+)/i, html);
};

NFOmation.prototype.fetch = function (nfo) {
    var url = this.NFO_URL.replace(/\{nfo\}/, nfo);

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(fetchIMDB)
        .then(function (imdbId) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return imdbId;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[NFOmation] ', err);
            }

            return null;
        });
};

module.exports = new NFOmation;
