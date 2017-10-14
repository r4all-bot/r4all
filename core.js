'use strict';

var Promise = require('bluebird');
var debug = require('debug')('Core');
var _ = require('lodash');
var moment = require('moment');

var log = require('./logger.js');
var settings = require('./settings.js');
var common = require('./common.js');
var db = require('./database.js');
var providers = {
    addic7ed: require('./providers/addic7ed.js'),
    imdb: require('./providers/imdb.js'),
    legendasdivx: require('./providers/legendasdivx.js'),
    rarbg: require('./providers/rarbg.js')
};

var Core = function() {
    // status
    this.isOn = false;
    this.isBusy = false;
    this.refreshes = 0;
    this.lastRefresh = null;

    var timer;

    // data
    var imdbList = {};

    this.setTimer = function() {
        timer = setTimeout(_.bind(this.refresh, this), settings.coreRefreshInterval);
    };

    this.clearTimer = function() {
        clearTimeout(timer);
    };

    this.clearIMDbInfo = function(imdbInfo) {
        imdbList = {};
    };

    this.addIMDbInfo = function(imdbInfo) {
        imdbList[imdbInfo._id] = imdbInfo;
    };

    this.getIMDbInfo = function(_id) {
        return imdbList[_id];
    };
};
Core.prototype.constructor = Core;

// **************************************************
// fetch & upsert releases
// **************************************************
var fetchReleases = function() {
    var rarbg = providers.rarbg;

    debug('fetching new releases');

    var _this = this;

    return db.getLastRelease()
        .then(function(lastRelease) {
            rarbg.lastRelease = lastRelease;
            return rarbg.fetchReleases();
        })
        .then(function(success) {
            if (!success || _.isEmpty(rarbg.newReleases)) {
                return [];
            }

            return _.values(rarbg.newReleases);
        });
};

// **************************************************
// verify releases
// **************************************************
var verifyRelease = function(release) {
    if (release.category.type == 'movie') {
        return _.bind(verifyMovie, this)(release);
    } else {
        return _.bind(verifyShow, this)(release);
    }
};

var verifyMovie = function(release) {
    var _this = this;

    return Promise.resolve(this.getIMDbInfo(release.imdbId) || providers.imdb.fetch(release.imdbId, release.category.type))
        .then(function(imdbInfo) {
            if (!imdbInfo) {
                return;
            }

            var validated = false;

            // Movie Title check
            var releaseTitle = release.parsed.releaseTitle.replace(/-/g, '.').toUpperCase(); // fix: replace allowed character '-' with dot - some releases replace with dot
            var movieTitleEncoded = common.scene.titleEncode(imdbInfo.title).toUpperCase(); // encode imdb movie title

            if (movieTitleEncoded != '' && (releaseTitle.indexOf(movieTitleEncoded) != -1 || movieTitleEncoded.indexOf(releaseTitle) != -1)) { // compare movie title
                validated = true;
            } else {
                imdbInfo.akas.some(function(aka) {
                    movieTitleEncoded = common.scene.titleEncode(aka).toUpperCase();

                    if (movieTitleEncoded != '' && (releaseTitle.indexOf(movieTitleEncoded) != -1 || movieTitleEncoded.indexOf(releaseTitle) != -1)) { // compare aka movie title
                        imdbInfo.aka = aka;
                        validated = true;
                        return true;
                    }

                    return false;
                });
            }

            // Year && Type check
            validated = validated && (imdbInfo.year == release.parsed.year) && imdbInfo.type == 'movie';

            var r = {
                _id: release._id,
                imdbId: imdbInfo._id, // because of imdb redirects, initial imdbId could not be the final one)
                isVerified: validated
            };

            _this.addIMDbInfo(imdbInfo);

            if (release.imdb._id == null || release.pubdate < release.imdb.pubdate) {
                imdbInfo.pubdate = release.pubdate;
            }

            return db.upsertIMDb(imdbInfo)
                .then(function() {
                    return db.upsertRelease(r);
                });
        });
};

var verifyShow = function(release) {
    var _this = this;

    return Promise.resolve(this.getIMDbInfo(release.imdbId) || providers.imdb.fetch(release.imdbId, release.category.type))
        .then(function(imdbInfo) {
            if (!imdbInfo) {
                return;
            }

            var isNewEpisodePromise;
            var r = {
                _id: release._id,
                imdbId: imdbInfo._id, // because of imdb redirects, initial imdbId could not be the final one)
                isVerified: true
            };

            if (release.imdb._id == null) {
                isNewEpisodePromise = Promise.resolve(true);
            } else if (release.imdb.pubdate >= release.pubdate) {
                isNewEpisodePromise = Promise.resolve(false);
            } else {
                isNewEpisodePromise = db.getLastEpisode(imdbInfo._id)
                    .then(function(lastEpisode) {
                        // return isNewEpisode;
                        return (release.season > lastEpisode.season) || (release.season == lastEpisode.season && _.max(release.episode) > _.max(lastEpisode.episode)) || (release._id == lastEpisode._id);
                    });
            }

            _this.addIMDbInfo(imdbInfo);

            return isNewEpisodePromise
                .then(function(isNewEpisode) {
                    if (isNewEpisode) {
                        imdbInfo.pubdate = release.pubdate;
                    }

                    return db.upsertIMDb(imdbInfo)
                })
                .then(function() {
                    return db.upsertRelease(r);
                });
        });
};

// **************************************************
// database maintenance
// **************************************************
var refreshIMDbOutdated = function() {
    return db.getIMDbOutdated()
        .then(function(doc) {
            return doc && providers.imdb.fetch(doc._id, doc.type)
        })
        .then(function(imdbInfo) {
            return imdbInfo && db.upsertIMDb(imdbInfo);
        });
};

// **************************************************
// controller
// **************************************************
Core.prototype.stop = function() {
    this.clearTimer();
    this.isOn = false;
};

Core.prototype.refresh = function() {
    this.isBusy = true;

    if (!this.isOn) {
        this.isOn = true;
    }

    debug('refreshing...');

    var _this = this;

    return _.bind(fetchReleases, this)()
        // .then(function(releases) {
        //     var fs = require('fs');
        //     var json = JSON.stringify(releases);
        //     fs.writeFileSync('releases.json', json);
        //     return releases;
        // })
        .map(function(release) {
            // release.parsed = common.scene.parseRelease(release);

            // if (release.category.type = 'show' && release.parsed) {
            //     release.season = release.parsed.season;
            //     release.episode = release.parsed.episode;
            // }

            // if (!release.imdb || !release.parsed) {
            //     release.isVerified = false;
            // }

            return db.upsertRelease(release);
        })
        // .then(db.getReleasesToVerify)
        // .each(function(release) {
        //     return _.bind(verifyRelease, _this)(release);
        // })
        // .then(refreshIMDbOutdated)
        .then(function() {
            _this.clearIMDbInfo();

            _this.refreshes++;
            _this.lastRefresh = moment();

            _this.setTimer();
            _this.isBusy = false;

            debug('refresh done!');

            return;
        })
        .catch(function(err) {
            log.error('core.refresh(): ', err);

            _this.stop();
            _this.isBusy = false;

            return null;
        });
};

module.exports = new Core;