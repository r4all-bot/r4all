'use strict';

var Promise = require('bluebird');
var debug = require('debug')('IMDb');
var cheerio = require('cheerio');
var _ = require('lodash');
var moment = require('moment');

var log = require('../logger.js');
var common = require('../common.js');

var trakttv = require('./trakttv.js');
var mdb = require('./themoviedb.js');;

var IMDb = function() {
    this.URL = 'http://akas.imdb.com';
    this.TITLE_URL = this.URL + '/title/{imdbId}/';
    this.TRAILER_URL = this.URL + '/video/imdb/{trailerId}/imdb/embed?autoplay=true&format=720p';

    // status
    this.isOn = true;
};
IMDb.prototype.constructor = IMDb;

var fetchInfo = function(imdbHtml, mdbInfo, trakttvInfo) {
    var info = {};

    var $ = cheerio.load(imdbHtml);

    // validate the page
    if (!$('#tn15').length) throw 'site validation failed (fetchInfo)';

    info._id = common.regex(/imdb\.com\/title\/(tt\d+)/i, $('link[href$="combined"]').attr('href'));
    info.title = common.regex(/^\s*(.+?)\s*\(.*?\d{4}.*?\)$/, $('title').text());
    info.akas = getAKAs($);

    if ($('.info h5:contains("Seasons:")').length) {
        info.title = info.title.replace(/^\"|\"$/g, '');
        info.type = 'show';
        info.seasons = [];
        info.numSeasons = 1;

        $('.info h5:contains("Seasons:")').next('.info-content').find('a').each(function() {
            var season = parseInt(common.unleak($(this).text()));

            info.seasons.push(common.unleak($(this).attr('href')));

            if (season > info.numSeasons) {
                info.numSeasons = season;
            }
        });
    } else {
        info.type = 'movie';
    }

    info.year = parseInt(common.regex(/\(.*?(\d{4}).*?\)$/, $('title').text()));
    info.plot = getPlot($);
    info.genres = getGenres($);
    info.runtime = parseInt(common.regex(/^.*?(\d+)/, $('.info h5:contains("Runtime:")').next('.info-content').text())) || null;
    info.rating = parseFloat(common.unleak($('#tn15rating .general .starbar-meta b').text()).split('/10')[0]) || null;
    info.votes = parseInt(common.unleak($('#tn15rating .general .starbar-meta a').text()).split(' ')[0].replace(/,/g, '')) || null;

    // mdbInfo
    if (mdbInfo) {
        info.cover = mdbInfo.cover;
        info.backdrop = mdbInfo.backdrop;
    }

    // trakttvInfo
    if (trakttvInfo) {
        info.trailer = trakttvInfo.trailer;

        if (trakttvInfo.state) {
            info.state = trakttvInfo.state;
        }
    }

    if (!info.cover) {
        var cover = common.unleak($('#primary-poster').attr('src'));
        if (cover && cover.indexOf('media-imdb.com') != -1) {
            info.cover = cover.replace(/_V1.*?\.jpg/i, '_V1._SY0.jpg');
        }
    }

    if (!info.trailer) {
        var trailerId = common.unleak($('#title-media-strip').find('a[href^="/video/"]').first().attr('data-video'));
        if (trailerId) {
            info.trailer = this.TRAILER_URL.replace(/\{trailerId\}/, trailerId);
        }
    }

    // data validation
    if (!info._id || !info.title || !info.year) {
        return;
    }

    var _this = this;

    if (info.type == 'movie') {
        return info;
    } else {
        return _.bind(fetchShowEpisodes, _this)(info);
    }
};

var getAKAs = function($) {
    var akas = [];

    $('.info h5:contains("Also Known As:")').next('.info-content').contents().each(function(i, el) {
        if (el.nodeType == 3) { // TextNode
            var aka = common.regex(/^"\s*(.+?)\s*"/, $(this).text().trim());

            if (aka) {
                akas.push(aka);
            }
        }
    });

    return akas;
};

var getGenres = function($) {
    var genres = [];

    $('.info h5:contains("Genre:")').next('.info-content').find('a[href^="/Sections/Genres/"]').each(function() {
        genres.push(common.unleak($(this).text()));
    });

    return genres;
};

var getPlot = function($) {
    var plot = '';

    $('.info h5:contains("Plot:")').next('.info-content').contents().each(function() {
        var chunk = common.unleak($(this).text());

        if (['Full summary', 'Full synopsis', 'Add synopsis', 'See more'].indexOf(chunk) != -1 || chunk.indexOf('»') != -1) {
            return false;
        }

        plot += chunk;
    });

    return plot.split('|')[0].trim();
};

var fetchShowEpisodes = function(info) {
    info.episodes = {};

    var _this = this;

    return Promise.resolve(info.seasons)
        .each(function(seasonEndpoint) {
            var url = _this.TITLE_URL.replace(/\{imdbId\}/, info._id) + seasonEndpoint;

            debug(url);

            return common.request(url)
                .then(function(html) {
                    return fetchEpisodes(html, info.episodes);
                });
        })
        .then(function() {
            delete info.seasons;
            return info;
        });
};

var fetchEpisodes = function(html, episodes) {
    var $ = cheerio.load(html);

    // validate the page
    if (!$('#episodes_content').length) throw 'site validation failed (fetchEpisodes)';

    $('.list_item').each(function() {
        var parsed = common.regex(/S(\d{1,3}), Ep(\d{1,3})/i, $(this).find('[itemprop="url"]').text().trim());

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

IMDb.prototype.resizeImage = function(imageUrl, size) {
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

IMDb.prototype.fetch = function(imdbId, type) {
    var url = this.TITLE_URL.replace(/\{imdbId\}/, imdbId) + 'combined';

    debug(url);

    var _this = this;

    return Promise.join(common.request(url), mdb.fetch(imdbId, type), trakttv.fetch(imdbId, type), _.bind(fetchInfo, _this))
        .then(function(info) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return info;
        })
        .catch(function(err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[IMDb] ', err);
            }

            return null;
        });
};

module.exports = new IMDb;