'use strict';

var debug = require('debug')('LegendasDivx');
var cheerio = require('cheerio');
var _ = require('lodash');

var log = require('../logger.js');
var common = require('../common.js');

var LegendasDivx = function () {
    this.URL = 'https://www.legendasdivx.pt';
    this.SEARCH_URL = this.URL + '/modules.php?name=Downloads&file=jz&d_op=search_next&form_cat=28&imdbid={imdbId}&order=&page={page}';
    this.SUBTITLE_URL = this.URL + '/modules.php?name=Downloads&d_op=viewdownloaddetails&lid={subtitleId}';
    this.DOWNLOAD_URL = this.URL + '/modules.php?name=Downloads&d_op=getit&lid={subtitleId}';

    // status
    this.isOn = true;
};
LegendasDivx.prototype.constructor = LegendasDivx;

var fetchSubtitle = function (releaseName, imdbId, page) {
    page = page || 1;

    var url = this.SEARCH_URL.replace(/\{imdbId\}/, imdbId.replace(/\D/g, '')).replace(/\{page\}/, page);

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(function (html) {
            var subtitleId = null;
            var nextpage = false;

            var $ = cheerio.load(html);

            // validate the page
            if (!$('.tdNAV').length) throw 'site validation failed';

            // each subtitle
            $('.sub_box').each(function () {
                // consider only ripped subtitles
                if ($(this).find('.sub_main').children('tr').eq(1).children('td').eq(2).text().trim().match(/Ripadas/i)) {
                    var re = new RegExp(releaseName, 'i');
                    var description = common.unleak($(this).find('.sub_main .td_desc').text());

                    if (description.match(re)) {
                        subtitleId = parseInt(common.rem(/lid=(\d+)$/i, $(this).find('.sub_download').attr('href')));
                        return false;
                    }
                }
            });

            // check if there are more pages            
            $('.pager_bar').first().find('a').each(function () {
                if ($(this).text().match(/Seguinte/i)) {
                    nextpage = true;
                    return false;
                }
            });

            return subtitleId || (nextpage && _.bind(fetchSubtitle, _this)(releaseName, imdbId, ++page));
        });
};

LegendasDivx.prototype.fetch = function (releaseName, imdbId) {
    var _this = this;

    return _.bind(fetchSubtitle, this)(releaseName, imdbId)
        .then(function (subtitleId) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return subtitleId;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[LegendasDivx] ', err);
            }

            return null;
        });
};

module.exports = new LegendasDivx;
