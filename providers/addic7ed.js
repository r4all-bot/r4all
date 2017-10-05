'use strict';

var debug = require('debug')('Addic7ed');
var cheerio = require('cheerio');

var log = require('../logger.js');
var common = require('../common.js');

var COMPATIBILITY = {
    DIMENSION: 'LOL|SYS',
    IMMERSE: 'XII|ASAP',
    AVS: 'SVA'
};

var Addic7ed = function () {
    this.URL = 'http://www.addic7ed.com';
    this.SHOW_LIST_URL = this.URL + '/shows.php';
    this.SHOW_LIST_SOFT_URL = this.URL + '/ajax_getShows.php';
    this.SHOW_EPISODE_URL = this.URL + '/re_episode.php?ep={addic7edId}-{season}x{episode}';
    this.SHOW_URL = this.URL + '/show/{addic7edId}?langs=|1|';

    // status
    this.isOn = true;
};
Addic7ed.prototype.constructor = Addic7ed;

var fetchSubtitle = function (html, group) {
    var subtitleId = null;

    group = group.toUpperCase();
    var re = new RegExp(group + (COMPATIBILITY[group] ? '|' + COMPATIBILITY[group] : ''), 'i');

    var $ = cheerio.load(html);

    // check if subtitle page already exists (redirects to homepage)
    if ($('#containernews').length) return;

    // validate the page
    if (!$('#qsSeason').length) throw 'site validation failed (fetchSubtitle)';

    // each subtitle
    $('.tabel95 .tabel95').each(function () {
        var version = common.unleak($(this).find('.NewsTitle').text());
        var compatibility = common.unleak($(this).find('.newsDate').first().text());

        // skip WEB-DL versions
        if (!version.match(/WEB(-|.)DL/i)) {
            $(this).find('.language').each(function () {
                // filter by English substitles and consider only completed && skip hearing imparied
                if ($(this).text().match(/English/i) && $(this).next().text().match(/Completed/i) && !$(this).parent().next().find('img[src="http://www.addic7ed.com/images/hi.jpg"]').length) {
                    if (version.match(re) || compatibility.match(re)) {
                        subtitleId = common.unleak($(this).parent().find('a[href^="/updated/"]').attr('href') || $(this).parent().find('a[href^="/original/"]').attr('href'));
                        return false;
                    }
                }
            });
        }
    });

    // filter English substitles
    if ($(this).find('.language').text().match(/English/i)) {}

    return subtitleId;
};

Addic7ed.prototype.download = function (subtitleId) {
    var _this = this;

    return common.req(this.URL + subtitleId, this.URL)
        .then(function (subtitle) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return subtitle;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[Addic7ed] ', err);
            }

            return null;
        });
};

Addic7ed.prototype.fetchShowId = function (showTitle) {
    debug(this.SHOW_LIST_SOFT_URL);

    var _this = this;

    return common.retry(this.SHOW_LIST_SOFT_URL)
        .then(function (html) {
            var $ = cheerio.load(html);

            // validate the page
            if (!$('#qsShow').length) throw 'site validation failed (fetchShowId)';

            return parseInt(common.unleak($('#qsShow option').filter(function () {
                return $(this).html() == showTitle;
            }).val())) || '';
        })
        .then(function (addic7edId) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return addic7edId;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[Addic7ed] ', err);
            }

            return null;
        });
};

Addic7ed.prototype.fetch = function (addic7edId, parsed) {
    var url = this.SHOW_EPISODE_URL.replace(/\{addic7edId\}/, addic7edId).replace(/\{season\}/, parsed.season).replace(/\{episode\}/, parsed.episodes[0]);

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(function (html) {
            return fetchSubtitle(html, parsed.group);
        })
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
                log.error('[Addic7ed] ', err);
            }

            return null;
        });
};

module.exports = new Addic7ed;
