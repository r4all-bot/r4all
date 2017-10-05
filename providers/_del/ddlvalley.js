'use strict';

var debug = require('debug')('DDLValley');
var cheerio = require('cheerio');
var _ = require('underscore');
var moment = require('moment-timezone');

var log = require('../logger.js');
var common = require('../common.js');

var DDLValley = function () {
    this.URL = 'http://www.ddlvalley.cool';
    this.SEARCH_URL = this.URL + '/?s={s}';
    this.POST_URL = this.URL + '/?p={postId}';

    // status
    this.isOn = true;

    this.lastPost = null;
    this.newLastPost = null;

    this.pending = null;
    this.newReleases = null;
};
DDLValley.prototype.constructor = DDLValley;

var fetchFeedReleasesInfo = function (xml, category) {
    var lastPost = this.lastPost;
    var forceSiteScraping = false,
        done = false;

    // fix cheerio bug using lowerCaseTags: false - Can't find elements with names with capitalized characters in standard mode (pubDate)
    var $ = cheerio.load(xml, {
        normalizeWhitespace: true,
        xmlMode: true,
        lowerCaseTags: true
    });

    // validate the page
    if (!$('item').length) throw category + ' feed validation failed';

    var _this = this;

    // loop through every item
    $('item').each(function () {
        var postId = parseInt(common.rem(/\?p=(\d+)/i, $(this).children('guid').text()));
        var postDate = common.unleak($(this).children('pubDate').text());
        var postTitle = common.unleak($(this).children('title').text());

        // data validation
        if (postId && moment(postDate, 'ddd, DD MMM YYYY HH:mm:ss').isValid()) {
            if (!postTitle) throw category + ' feed scraping: no post title (' + postId + ')';

            postDate = moment.tz(postDate, 'ddd, DD MMM YYYY HH:mm:ss', process.env.TZ);

            // define stop point
            if (lastPost && postDate.diff(lastPost.postDate) <= 0) {
                if (postId == lastPost.postId || postDate.isBefore(lastPost.postDate)) {
                    debug(category + ' feed scraping done at ' + postDate.tz('Europe/Lisbon').format('YYYY-MM-DD HH:mm:ss'));
                    done = true;
                    return false;
                }
            }

            var release = _this.newReleases[postId] = {};

            release.ddlvalley = postId;
            release.postTitle = postTitle;
            release.date = postDate.toDate();

            if (category.charAt(0) == 'm') {
                release.imdbId = common.rem(/imdb\.com\/title\/(tt\d+)/i, $(this).children('description').text());
                release.nfo = common.rem(/nfomation\.net\/info\/(.+\.(?:nfo|txt))/i, $(this).children('description').text());
            }

            // define new lastPost
            if (!_this.newLastPost) {
                _this.newLastPost = {
                    _id: 'ddlvalley-' + category,
                    postDate: release.date,
                    postId: postId
                };
            }

            _this.pending.push({
                postId: postId
            });
        } else {
            forceSiteScraping = true;
            log.warn(category + ' feed scraping: no post id/datetime (' + postTitle + ')');
        }
    });

    return !forceSiteScraping && done;
};

var fetchSiteReleases = function (category, page) {
    var url = this.URL;

    page = page || 1;

    // site url
    if (category == 'm720p')
        url += '/category/movies/bluray-720p/';
    else if (category == 'm1080p')
        url += '/category/movies/bluray-1080p/';
    else
        url += '/category/tv-shows/';

    url += 'page/' + page + '/';

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(function (html) {
            return _.bind(fetchSiteReleasesInfo, _this)(html, category, page);
        });
};

var fetchSiteReleasesInfo = function (html, category, page) {
    var stopPoint = this.lastPost && moment(this.lastPost.postDate).subtract(1, 'day'); // feed and site hour differs from 1 hour - fix (-1day) to prevent scraping not reaching the last post
    var done = false;

    var $ = cheerio.load(html);

    // validate the page
    if (!$('.post').length) throw category + ' site validation failed (fetchSiteReleasesInfo)';

    var _this = this;

    // loop through every post
    $('.post').each(function () {
        var postDate = common.unleak($(this).find('.date').text());

        // define stop point
        if (stopPoint && moment(postDate, 'MMM Do, YYYY').isValid() && moment(postDate, 'MMM Do, YYYY').isBefore(stopPoint)) {
            debug(category + ' site scraping done at ' + moment(postDate, 'MMM Do, YYYY').format('YYYY-MM-DD'));
            done = true;
            return false;
        }

        _.bind(fetchPostInfo, _this)(this, category, common.unleak($(this).prev('h2').text()));
    });

    // check if reached last page
    if (!done && !$('.nextpostslink').length) {
        debug(category + ' site scraping reached the last page: ' + page);
        done = true;
    }

    return done || _.bind(fetchSiteReleases, this)(category, ++page);
};

var fetchPostInfo = function (html, category, postTitle, pendingPostDate) {
    var $ = cheerio.load(html);

    // validate the page
    if (!$('.post').length) {
        if ($('#core').length) { // post no longer exists
            return;
        } else {
            throw category + ' site validation failed (fetchPostInfo)';
        }
    }

    var postId = parseInt(common.rem(/post-(\d+)/i, $('.post').attr('id')));
    var postDate = common.unleak($('.post').find('.date').text());
    var postTitle = common.unleak(postTitle || $('.post').prev('h1').text() || common.rem(/^Download\s*(.+)\s*$/i, $('.post').find('.dl a').attr('title')) || common.rem(/\s*(.+)\s*\| DDLValley*$/i, $('title').text()));

    // data validation
    if (!postId || !moment(postDate, 'MMM Do, YYYY').isValid()) throw category + ' site scraping: no post id/date (' + postTitle + ')';
    if (!postTitle) throw category + ' site scraping: no post title (' + postId + ')';

    var release = this.newReleases[postId] = this.newReleases[postId] || {};

    if (!release.ddlvalley) {
        release.ddlvalley = postId;
        release.postTitle = postTitle;
        release.date = moment(postDate, 'MMM Do, YYYY').toDate();

        if (category.charAt(0) == 'm') {
            release.imdbId = common.rem(/imdb\.com\/title\/(tt\d+)/i, $('.post').find('a[href*="imdb.com/title/"]').first().attr('href'));
            release.nfo = common.rem(/nfomation\.net\/info\/(.+\.(?:nfo|txt))/i, $('.post').find('a[href*="nfomation.net/info/"]').first().attr('href'));
        }
    }

    // set datetime
    if (pendingPostDate && moment(postDate, 'MMM Do, YYYY').isBefore(pendingPostDate)) release.date = pendingPostDate;

    release.postTitle = release.postTitle.replace(/×/g, 'x').replace(/\\xAD/g, ''); // fix: replace × (&times;) character && remove soft hyphens
    release.category = category;
    release.name = common.scene.getReleaseName(release.postTitle, release.category);
    release._id = release.name && release.name.replace(/[^\w_]/g, '').toUpperCase();
    release.isScene = !($('.post').find('.isScene.p2p').length > 0) || $('.isScene.sce').length > 0 // consider not tagged releases as scene releases

    return;
};

var fetchPending = function (release, category) {
    var r = this.newReleases[release.postId];

    if (!r || typeof r.isScene === 'undefined')
        return _.bind(fetchPost, this)(release, category);
    else
        return;
};

var fetchPost = function (release, category) {
    var url = this.POST_URL.replace(/\{postId\}/, release.postId);

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(function (html) {
            return _.bind(fetchPostInfo, _this)(html, category, null, release.date); // pass release.date to keep datetime instead of only date
        });
};

DDLValley.prototype.fetch = function (category) {
    var url = this.URL;

    // feed url
    if (category == 'm720p')
        url += '/category/movies/bluray-720p/feed/';
    else if (category == 'm1080p')
        url += '/category/movies/bluray-1080p/feed/';
    else
        url += '/category/tv-shows/feed/';

    // init
    this.newLastPost = null;
    this.newReleases = {};

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(function (xml) {
            var done = _.bind(fetchFeedReleasesInfo, _this)(xml, category);

            return done || _.bind(fetchSiteReleases, _this)(category);
        })
        .thenReturn(_this.pending)
        .each(function (release) {
            return _.bind(fetchPending, _this)(release, category);
        })
        .then(function () {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return true;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[DDLValley] ', err);
            }

            return false;
        });
};

module.exports = new DDLValley;