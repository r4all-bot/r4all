'use strict';

var debug = require('debug')('RARBG');
var Promise = require('bluebird');
var _ = require('lodash');
var URI = require('urijs');
var cheerio = require('cheerio');
var moment = require('moment-timezone');

var log = require('../logger.js');
var settings = require('../settings.js');
var common = require('../common.js');
var proxy = require('./proxy.js');

var RARBG = function() {
    this.URL = URI('https://rarbg.to');

    // status
    this.isOn = true;
    this.proxy = null;

    this.lastRelease = null;
    this.newReleases = null;
};
RARBG.prototype.constructor = RARBG;

var getReleases = function(html, page) {
    var lastRelease = this.lastRelease;
    var done = false;

    var $ = cheerio.load(html);

    // validate the page
    if (!$('.lista2t').length) throw 'site validation failed (getReleases)';

    var _this = this;

    // loop through every row
    $('.lista2t .lista2').each(function() {
        var column1 = $(this).find('.lista').eq(0);
        var column2 = $(this).find('.lista').eq(1);
        var column3 = $(this).find('.lista').eq(2);

        var release = {
            _id: null,
            name: common.unleak($(column2).find('a[href^="/torrent/"]').text()).trim().replace(/\[.+\]$/, ''),
            category: parseInt(common.regex(/\/torrents\.php\?category=(\d+)/i, $(column1).find('a[href^="/torrents.php?category="]').attr('href'))),
            pubdate: common.unleak($(column3).text()),
            imdbId: common.regex(/\/torrents\.php\?imdb=(tt\d+)/i, $(column2).find('a[href^="/torrents.php?imdb="]').attr('href'))
        };

        // validation
        if ([41, 44, 45].indexOf(release.category) != -1 && release.name && moment(release.pubdate, 'YYYY-MM-DD HH:mm:ss').isValid()) {
            release.pubdate = moment.tz(release.pubdate, 'YYYY-MM-DD HH:mm:ss', process.env.TZ);

            // define stop point
            if (lastRelease && release.pubdate.diff(lastRelease.pubdate) <= 0) {
                if (release.name == lastRelease.name || release.pubdate.isBefore(lastRelease.pubdate)) {
                    debug('site scraping done at ' + release.pubdate.tz('Europe/Lisbon').format('YYYY-MM-DD HH:mm:ss'));
                    done = true;
                    return false;
                }
            }

            release._id = release.name.replace(/[^\w_]/g, '').toUpperCase();
            release.category = common.getCategory(release.name, release.category);
            release.pubdate = release.pubdate.toDate();

            _this.newReleases[release._id] = release;
        } else {
            throw 'site scraping: ' + release.category + '|' + release.name + '|' + release.pubdate;
        }
    });

    // check if reached last page
    if (!done && !$('#pager_links').find('a[title="next page"]').length) {
        debug('site scraping reached the last page: ' + page);
        done = true;
    }

    return done;
};

var getReleasesFromPage = function(page, attempt) {
    attempt = attempt || 1;

    attempt > 1 && debug('attempt: ' + attempt);

    var url = this.URL.clone()
        .segment('torrents.php')
        .addQuery({ category: '41;44;45', page: page })
        .toString();

    var _this = this;

    return Promise.resolve((_this.proxy && { proxy: _this.proxy }) || proxy.fetch(url, { type: 'html', element: '.lista2t' }))
        .then(function(result) {
            if (_this.proxy != result.proxy) {
                _this.proxy = result.proxy;
                debug('using new proxy: ' + _this.proxy);
            }

            debug(url);

            return (result.resp || common.request(url, { proxy: _this.proxy, tunnel: false }));
        })
        .then(function(html) {
            return _.bind(getReleases, _this)(html, page);
        })
        .catch(function(err) {
            if (attempt >= settings.loadPageAttempts) throw err;

            _this.proxy = null;

            return _.bind(getReleasesFromPage, _this)(page, ++attempt);
        });
};

var getReleasesFromPages = function(page) {
    page = page || 1;

    var _this = this;

    return _.bind(getReleasesFromPage, _this)(page)
        .then(function(done) {
            return done || Promise.delay(1 * 1000).then(function() {
                return _.bind(getReleasesFromPages, _this)(++page);
            });
        });
};

RARBG.prototype.fetchReleases = function() {
    // init
    this.newReleases = {};

    var _this = this;

    return _.bind(getReleasesFromPages, _this)()
        .then(function() {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return true;
        })
        .catch(function(err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[RARBG] ', err);
            }

            return false;
        });
};

module.exports = new RARBG;