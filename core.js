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
        timer = setTimeout(_.bind(this.refresh, this), settings.refreshInterval);
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

    return Promise.resolve(this.getIMDbInfo(release.imdbId) || providers.imdb.fetch(release.imdbId))
        .then(function(imdbInfo) {
            if (!imdbInfo) {
                return;
            }

            var validated = false;

            _this.addIMDbInfo(imdbInfo);

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

            if (release.imdb._id == null || release.pubdate < release.imdb.pubdate) {
                imdbInfo.pubdate = release.pubdate;
            }

            return db.upsertIMDb(imdbInfo)
                .then(function() {
                    return db.upsertRelease(r);
                });
        });
};


//*********************aqui
var verifyShow = function(release) {
    var _this = this;

    return Promise.resolve(this.getShow(release.showId))
        .then(function(show) {
            if (show) {
                if (show.isVerified) {
                    var r = {
                        _id: release._id,
                        imdbId: show.imdbId,
                        isVerified: 1
                    };

                    return db.upsertRelease(r)
                        .then(function() {
                            log.found(release.name);
                            release.isVerified = 1;
                            release.addic7edId = show.addic7edId;
                            return jobHandler(release);
                        });
                } else {
                    return;
                }
            } else {
                return providers.rarbg.fetch(release.name, release.category)
                    .then(function(torrent) {
                        if (!torrent) {
                            return;
                        }

                        var show = {
                            _id: release.showId,
                            imdbId: torrent.imdbId,
                        };

                        return db.upsertShow(show)
                            .then(function() {
                                return _this.addShow(show);
                            });
                    });

                // var altSearch = release.showId + '-' + release.parsed.group; // releaseTitle-group

                // return providers.kickasstorrents.fetchReleaseInfo(release.name, release.category, altSearch)
                //     .then(function (info) {
                //         if (!info) {
                //             return;
                //         }

                //         return providers.addic7ed.fetchShowId(info.title)
                //             .then(function (addic7edId) {
                //                 if (!addic7edId && !providers.addic7ed.isOn) {
                //                     return;
                //                 }

                //                 var show = {
                //                     _id: release.showId,
                //                     folder: info.title.replace(/\\|\/|:|\*|\?|"|<|>|\|/g, ''),
                //                     imdbId: info.imdbId,
                //                     addic7edId: addic7edId
                //                 };

                //                 return db.upsertShow(show)
                //                     .then(function () {
                //                         return _this.addShow(show);
                //                     });
                //             });
                //     });
            }
        });
};

// **************************************************
// jobHandler
// **************************************************
// var jobHandler = function(release) {
//     if (release.isVerified) {
//         return fetchSubtitle(release)
//             .then(function(subtitleId) {
//                 var r = {
//                     _id: release._id,
//                     subtitleId: subtitleId
//                 };

//                 return subtitleId && db.upsertRelease(r);
//             });
//     } else {

//     }
// };

// **************************************************
// fetch movie/show info & validate
// **************************************************


// **************************************************
// fetchTorrent & fetchSubtitle
// **************************************************
// var fetchTorrent = function (release) {
//     return providers.kickasstorrents.fetch(release.name, release.category)
//         .then(function (torrent) {
//             return torrent || providers.rarbg.fetch(release.name, release.category);
//         })
//         .then(function (torrent) {
//             return torrent || providers.thepiratebay.fetch(release.name, release.category);
//         });
// };

// this.fetchSubtitle = function(release) {
//     if (release.category.type == 'movie') {
//         return providers.legendasdivx.fetch(release.name, release.imdbId);
//     } else {
//         return release.addic7edId && providers.addic7ed.fetch(release.addic7edId, release.parsed);
//     }
// };

// **************************************************
// database maintenance
// **************************************************
// var refreshIMDbOutdated = function () {
//     return db.getIMDbOutdated()
//         .then(function (doc) {
//             return doc && providers.imdb.fetch(doc._id)
//         })
//         .then(function (imdbInfo) {
//             return imdbInfo && db.upsertIMDb(imdbInfo);
//         });
// };

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
        .map(function(release) {
            // release.parsed = common.scene.parseRelease(release);

            // if (!release.imdb || !release.parsed) {
            //     release.isVerified = false;
            // }

            return db.upsertRelease(release);
        })
        // .then(db.getReleasesToVerify)
        // .each(function(release) {
        //     return _.bind(verifyRelease, _this)(release);
        // })



        // .then(_.bind(fetchShowList, this))
        // .then(_.partial(db.getJobs, fetchAllJobs))
        // .each(function (release) {
        //     return _.bind(jobHandler, _this)(release);
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