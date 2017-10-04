'use strict';

var debug = require('debug')('Core');
var Promise = require('bluebird');
var _ = require('lodash');
var moment = require('moment');

var log = require('./logger.js');
var settings = require('./settings.js');
var common = require('./common.js');
var db = require('./database.js');
var providers = {
    rarbg: require('./providers/rarbg.js'),
    imdb: require('./providers/imdb.js'),
    kickasstorrents: require('./providers/kickasstorrents.js'),
    thepiratebay: require('./providers/thepiratebay.js'),
    addic7ed: require('./providers/addic7ed.js'),
    legendasdivx: require('./providers/legendasdivx.js')
};

var Core = function () {
    // status
    this.isOn = false;
    this.isBusy = false;
    this.refreshes = 0;
    this.lastRefresh = null;
    this.lastFetchAllJobs = moment().hours(0).minutes(0).seconds(0);

    var timer;

    // data
    var updReleases;
    var showList;
    var imdbColl = {};

    this.setTimer = function () {
        timer = setTimeout(_.bind(this.refresh, this), settings.refreshInterval);
    };

    this.clearTimer = function () {
        clearTimeout(timer);
    };

    this.setShowList = function (shows) {
        showList = {};

        _.each(shows, function (s) {
            showList[s._id] = s;
        });
    };

    this.addShow = function (show) {
        showList[show._id] = show;
    };

    this.getShow = function (_id) {
        return showList[_id];
    };

    this.addIMDbColl = function (imdbInfo) {
        imdbColl[imdbInfo._id] = imdbInfo;
    };

    this.getIMDbInfo = function (_id) {
        return imdbColl[_id];
    };
};
Core.prototype.constructor = Core;

// **************************************************
// fetch & filter & upsert releases
// **************************************************
var fetchReleases = function () {
    var rarbg = providers.rarbg;

    debug('fetching from rarbg');

    var _this = this;

    return db.getLastRelease()
        .then(function (lastRelease) {
            rarbg.lastRelease = lastRelease;
            return rarbg.fetch();
        })
        .then(function (success) {
            if (!success || _.isEmpty(rarbg.newReleases)) {
                return;
            }

            return Promise.resolve()
                .thenReturn(_.values(feed.newReleases))
                .map(function (release) {
                    return _.bind(filterRelease, _this)(release);
                });
        });
};

var filterRelease = function (release) {
    release.parsed = common.scene.parseRelease(release.name, release.category);

    if (release.parsed) {
        if (release.category.charAt(0) == 's') {
            release.showId = release.parsed.releaseTitle;
        }

        return db.upsertRelease(release)
            .then(function () {
                return db.removePending(release, feedname);
            });
    } else {
        if (release.category.charAt(0) == 'm') {
            release.isVerified = 0;

            return db.upsertRelease(release)
                .then(function () {
                    return db.removePending(release, feedname);
                })
                .then(function () {
                    log.warn('(movie not parsed)', {
                        name: release.name,
                        feed: feedname,
                        postId: release[feedname]
                    });
                    return;
                });
        } else {
            return removePending(release, feedname, '(show not parsed)');
        }
    }
};

// **************************************************
// fetchShowList
// **************************************************
var fetchShowList = function () {
    var _this = this;

    return db.getShowList()
        .then(_this.setShowList);
};

// **************************************************
// jobHandler
// **************************************************
var jobHandler = function (release) {
    if (release.isVerified) {
        return Promise.join(!release.magnetLink && fetchTorrent(release), !release.subtitleId && fetchSubtitle(release), function (torrent, subtitleId) {
            var r = {
                _id: release._id
            };

            if (torrent) {
                delete torrent.imdbId;
                _.extend(r, torrent);
            }

            if (subtitleId) {
                r.subtitleId = subtitleId;
            }

            return (torrent || subtitleId) && db.upsertRelease(r);
        });
    } else {
        if (release.category.charAt(0) == 'm') {
            return _.bind(fetchMovieInfo, this)(release);
        } else {
            return _.bind(fetchShowInfo, this)(release);
        }
    }
};

// **************************************************
// fetch movie/show info & validate
// **************************************************
var fetchMovieInfo = function (release) {
    var _this = this;

    return Promise.resolve(release.nfo && providers.nfomation.fetch(release.nfo))
        .then(function (imdbId) {
            imdbId = imdbId || release.imdbId;

            if (imdbId) {
                return _.bind(validateMovie, _this)(release, imdbId)
                    .then(function (validated) {
                        if (typeof validated === 'undefined') {
                            return;
                        }

                        var r = {
                            _id: release._id,
                            imdbId: release.imdbId,
                            isVerified: +validated
                        };

                        if (validated) {
                            return db.upsertIMDb(_this.getIMDbInfo(r.imdbId))
                                .then(function () {
                                    return db.upsertRelease(r);
                                })
                                .then(function () {
                                    log.found(release.name);
                                    release.isVerified = 1;
                                    return jobHandler(release);
                                });
                        } else {
                            return db.upsertRelease(r)
                                .then(function () {
                                    log.warn(release.name + ' (not validated)', {
                                        imdb: release.imdbId
                                    });
                                    return;
                                });
                        }
                    });
            } else {
                if (!providers.nfomation.isOn) {
                    return;
                }

                return providers.rarbg.fetch(release.name, release.category)
                    .then(function (torrent) {
                        if (torrent && torrent.imdbId) {
                            release.imdbId = torrent.imdbId;
                            return _.bind(fetchMovieInfo, _this)(release);
                        } else {
                            if (!providers.rarbg.isOn) {
                                return;
                            }

                            var r = {
                                _id: release._id,
                                isVerified: 0
                            };

                            return db.upsertRelease(r)
                                .then(function () {
                                    log.warn(release.name + ' (missing imdb id)');
                                    return;
                                });
                        }
                    });

                // var altSearch = release.parsed.releaseTitle + (release.parsed.year ? '.' + release.parsed.year : '') + '-' + release.parsed.group; // releaseTitle.year-group

                // return providers.kickasstorrents.fetchReleaseInfo(release.name, release.category, altSearch)
                //     .then(function (info) {
                //         if (info && info.imdbId) {
                //             release.imdbId = info.imdbId;
                //             return _.bind(fetchMovieInfo, _this)(release);
                //         } else {
                //             if (!providers.kickasstorrents.isOn) {
                //                 return;
                //             }

                //             var r = {
                //                 _id: release._id,
                //                 isVerified: 0
                //             };

                //             return db.upsertRelease(r)
                //                 .then(function () {
                //                     log.warn(release.name + ' (missing imdb id)');
                //                     return;
                //                 });
                //         }
                //     });
            }
        });
};

var validateMovie = function (release, imdbId) {
    imdbId = imdbId || release.imdbId;

    var _this = this;

    return Promise.resolve(this.getIMDbInfo(imdbId) || providers.imdb.fetch(imdbId))
        .then(function (imdbInfo) {
            if (!imdbInfo) {
                return;
            }

            var validated = false;

            _this.addIMDbColl(imdbInfo);

            var releaseTitle = release.parsed.releaseTitle.replace(/-/g, '.'); // fix: replace allowed character '-' with dot - some releases replace with dot
            var movieTitleEncoded = common.scene.titleEncode(imdbInfo.title).toUpperCase(); // encode movie title from imdb movie title

            if (movieTitleEncoded != '' && (releaseTitle.indexOf(movieTitleEncoded) != -1 || movieTitleEncoded.indexOf(releaseTitle) != -1)) { // compare movie title
                validated = true;
            } else { // check aka movie titles
                imdbInfo.akas.some(function (aka) {
                    movieTitleEncoded = common.scene.titleEncode(aka).toUpperCase();

                    if (movieTitleEncoded != '' && (releaseTitle.indexOf(movieTitleEncoded) != -1 || movieTitleEncoded.indexOf(releaseTitle) != -1)) { // compare movie title
                        imdbInfo.aka = aka;
                        validated = true;
                        return true;
                    }

                    return false;
                });
            }

            // check year && type
            validated = validated && imdbInfo.year == release.parsed.year && imdbInfo.type == 'movie';

            if (validated) {
                release.imdbId = imdbInfo._id; // to set nfo imdbId (and because of imdb redirects, initial imdbId could not be the final one)
            }

            return validated || (release.imdbId && release.imdbId != imdbId && _.bind(validateMovie, _this)(release));
        });
};

var fetchShowInfo = function (release) {
    var _this = this;

    return Promise.resolve(this.getShow(release.showId))
        .then(function (show) {
            if (show) {
                if (show.isVerified) {
                    var r = {
                        _id: release._id,
                        imdbId: show.imdbId,
                        isVerified: 1
                    };

                    return db.upsertRelease(r)
                        .then(function () {
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
                    .then(function (torrent) {
                        if (!torrent) {
                            return;
                        }

                        var show = {
                            _id: release.showId,
                            imdbId: torrent.imdbId,
                        };

                        return db.upsertShow(show)
                            .then(function () {
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
// fetchTorrent & fetchSubtitle
// **************************************************
var fetchTorrent = function (release) {
    return providers.kickasstorrents.fetch(release.name, release.category)
        .then(function (torrent) {
            return torrent || providers.rarbg.fetch(release.name, release.category);
        })
        .then(function (torrent) {
            return torrent || providers.thepiratebay.fetch(release.name, release.category);
        });
};

var fetchSubtitle = function (release) {
    if (release.category.charAt(0) == 'm') {
        return providers.legendasdivx.fetch(release.name, release.imdbId);
    } else {
        return release.addic7edId && providers.addic7ed.fetch(release.addic7edId, release.parsed);
    }
};

// **************************************************
// database maintenance
// **************************************************
var refreshIMDbOutdated = function () {
    return db.getIMDbOutdated()
        .then(function (doc) {
            return doc && providers.imdb.fetch(doc._id)
        })
        .then(function (imdbInfo) {
            return imdbInfo && db.upsertIMDb(imdbInfo);
        });
};

// **************************************************
// controller
// **************************************************
Core.prototype.stop = function () {
    this.clearTimer();
    this.isOn = false;
};

Core.prototype.refresh = function () {
    this.isBusy = true;

    if (!this.isOn) {
        this.isOn = true;
    }

    debug('refreshing...');

    var fetchAllJobs = moment().diff(this.lastFetchAllJobs, 'days') > 0;
    var _this = this;

    return db.setSettings()
        .then(_.bind(fetchReleases, this))
        .then(_.bind(fetchShowList, this))
        .then(_.partial(db.getJobs, fetchAllJobs))
        .each(function (release) {
            return _.bind(jobHandler, _this)(release);
        })
        .then(refreshIMDbOutdated)
        .then(function () {
            _this.refreshes++;
            _this.lastRefresh = moment();

            // refresh lastFetchAllJobs
            if (fetchAllJobs) {
                _this.lastFetchAllJobs = moment().hours(0).minutes(0).seconds(0);
            }

            _this.setTimer();
            _this.isBusy = false;

            debug('refresh done!');

            return;
        })
        .catch(function (err) {
            log.error('core.refresh(): ', err);

            _this.stop();
            _this.isBusy = false;

            return null;
        });
};

module.exports = new Core;
