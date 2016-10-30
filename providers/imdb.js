'use strict';

var Promise = require('bluebird');
var debug = require('debug')('IMDb');
var cheerio = require('cheerio');
var _ = require('underscore');
var moment = require('moment');

var log = require('../logger.js');
var common = require('../common.js');

var trakttv = require('./trakttv.js');
var mdb = require('./themoviedb.js');;

var IMDb = function () {
    this.URL = 'http://akas.imdb.com';
    this.TITLE_URL = this.URL + '/title/{imdbId}/';
    this.TRAILER_URL = this.URL + '/video/imdb/{trailerId}/imdb/embed?autoplay=true&format=720p';

    // status
    this.isOn = true;
};
IMDb.prototype.constructor = IMDb;

var fetchInfo = function (html) {
    var info = {};

    var $ = cheerio.load(html);

    // validate the page
    if (!$('#tn15').length) throw 'site validation failed (fetchInfo)';

    info._id = common.rem(/imdb\.com\/title\/(tt\d+)/i, $('link[href$="combined"]').attr('href'));
    info.title = common.rem(/^\s*(.+?)\s*\(.*?\d{4}.*?\)$/, $('title').text());
    info.akas = getAKAs($);

    if ($('.info h5:contains("Seasons:")').length) {
        info.type = 'show';
        info.seasons = [];
        info.numSeasons = 1;

        $('.info h5:contains("Seasons:")').next('.info-content').find('a').each(function () {
            var season = parseInt(common.unleak($(this).text()));

            info.seasons.push(common.unleak($(this).attr('href')));

            if (season > info.numSeasons) {
                info.numSeasons = season;
            }
        });
    } else {
        info.type = 'movie';
    }

    info.year = parseInt(common.rem(/\(.*?(\d{4}).*?\)$/, $('title').text()));
    info.plot = getPlot($);
    info.genres = getGenres($);
    info.runtime = parseInt(common.rem(/^.*?(\d+)/, $('.info h5:contains("Runtime:")').next('.info-content').text())) || '';
    info.rating = parseFloat(common.unleak($('#tn15rating .general .starbar-meta b').text()).split('/10')[0]) || '';
    info.votes = parseInt(common.unleak($('#tn15rating .general .starbar-meta a').text()).split(' ')[0].replace(/,/g, '')) || '';

    var cover = common.unleak($('#primary-poster').attr('src'));
    if (cover && cover.indexOf('media-imdb.com') != -1) {
        info.cover = cover.replace(/_V1.*?\.jpg/i, '_V1._SY0.jpg');
    }

    var trailerId = common.unleak($('#title-media-strip').find('a[href^="/video/"]').first().attr('data-video'));
    if (trailerId) {
        info.trailer = this.TRAILER_URL.replace(/\{trailerId\}/, trailerId);
    }

    // data validation
    if (!info._id || !info.title || !info.year) {
        return;
    }

    var _this = this;

    return trakttv.fetch(info._id, info.type)
        .then(function (newInfo) {
            if (newInfo) {
                info.trailer = newInfo.trailer || info.trailer;

                if (newInfo.state) {
                    info.state = newInfo.state;
                }
            }

            return mdb.fetch(info._id, info.type);
        })
        .then(function (newInfo) {
            if (newInfo) {
                info.cover = newInfo.cover || info.cover;
                info.backdrop = newInfo.backdrop;
            }

            if (info.type == 'movie') {
                return info;
            } else {
                return _.bind(fetchShowEpisodes, _this)(info);
            }
        });
};

var getGenres = function ($) {
    var genres = [];

    $('.info h5:contains("Genre:")').next('.info-content').find('a[href^="/Sections/Genres/"]').each(function () {
        genres.push(common.unleak($(this).text()));
    });

    return genres;
};

var getPlot = function ($) {
    var plot = '';

    $('.info h5:contains("Plot:")').next('.info-content').contents().each(function () {
        if (['Full summary', 'Full synopsis', 'Add synopsis', 'See more'].indexOf($(this).text()) != -1 || $(this).text().indexOf('»') != -1) {
            return false;
        }

        plot += common.unleak($(this).text());
    });

    return plot.split('|')[0].trim();
};

var getAKAs = function ($) {
    var akas = [];

    $('.info h5:contains("Also Known As:")').next('.info-content').contents().each(function (i, el) {
        if (el.nodeType == 3) { // TextNode
            var aka = common.rem(/^"\s*(.+?)\s*"/, $(this).text().trim());

            if (aka) {
                akas.push(aka);
            }
        }
    });

    return akas;
};

var fetchShowEpisodes = function (info) {
    info.episodes = {};

    var _this = this;

    return Promise.resolve(info.seasons)
        .each(function (season) {
            var url = _this.TITLE_URL.replace(/\{imdbId\}/, info._id) + season;

            debug(url);

            return common.retry(url)
                .then(function (html) {
                    return fetchEpisodes(html, info.episodes);
                });
        })
        .then(function () {
            delete info.seasons;
            return info;
        });
};

var fetchEpisodes = function (html, episodes) {
    var $ = cheerio.load(html);

    // validate the page
    if (!$('#episodes_content').length) throw 'site validation failed (fetchEpisodes)';

    $('.list_item').each(function () {
        var parsed = common.rem(/S(\d{1,2}), Ep(\d{1,2})/i, $(this).find('[itemprop="url"]').text().trim());

        if (parsed) {
            var season = parseInt(parsed[0]);
            var episode = parseInt(parsed[1]);
            var aired = common.unleak($(this).find('.airdate').text()).trim();

            episodes[season] = episodes[season] || {};
            var ep = episodes[season][episode] = {};

            ep.title = common.unleak($(this).find('[itemprop="name"]').text()).trim();
            ep.aired = moment(aired, 'D MMM. YYYY').isValid() && moment(aired, 'D MMM. YYYY').toDate();
            ep.description = common.unleak($(this).find('.item_description').text()).trim();
        }
    });

    return;
};

IMDb.prototype.resizeImage = function (imageUrl, size) {
    var toSize;

    switch (size) {
        case 'thumb':
            toSize = '_V1._SX300.jpg';
            break;
        case 'medium':
            toSize = '_V1._SX600.jpg';
            break;
        default:
            toSize = '_V1._SY0.jpg';
    }

    return imageUrl.replace(/_V1.*?\.jpg/i, toSize);
};

IMDb.prototype.fetch = function (imdbId) {
    var url = this.TITLE_URL.replace(/\{imdbId\}/, imdbId) + 'combined';

    debug(url);

    var _this = this;

    return common.retry(url)
        .then(_.bind(fetchInfo, _this))
        .then(function (info) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return info;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[IMDb] ', err);
            }

            return null;
        });
};

module.exports = new IMDb;
