'use strict';

var Promise = require('bluebird');
var _ = require('lodash');

function checkAuth(req, res, next) {
    if (!req.session.user_id) {
        req.session.redirectTo = req.originalUrl;
        res.redirect('/login/');
    } else {
        next();
    }
}

function getLayoutData(req, res, next) {
    var locals = req.app.locals;
    var db = locals.db;

    db.getReleasesCategoryCount()
        .then(function (total) {
            locals.total720pMovieReleases = 0;
            locals.total1080pMovieReleases = 0;
            locals.totalShowReleases = 0;
            locals.totalUnverifiedMovies = 0;

            _.each(total, function (subTotal) {
                if (subTotal._id.category == 's720p') {
                    locals.totalShowReleases += subTotal.count;
                } else if (subTotal._id.category == 'm720p') {
                    if (subTotal._id.isVerified == 0) {
                        locals.totalUnverifiedMovies += subTotal.count;
                    }

                    locals.total720pMovieReleases += subTotal.count;
                } else if (subTotal._id.category == 'm1080p') {
                    if (subTotal._id.isVerified == 0) {
                        locals.totalUnverifiedMovies += subTotal.count;
                    }

                    locals.total1080pMovieReleases += subTotal.count;
                }
            });

            return db.getUnverifiedShowsCount();
        })
        .then(function (total) {
            locals.totalUnverifiedShows = total;
            return next();
        });
}

module.exports = function (app) {
    // **************************************************
    // login & logout
    // **************************************************
    app.get('/login', function (req, res) {
        if (!req.url.endsWith('/')) {
            req.url += '/';
            res.redirect(req.url);
        } else {
            if (req.session.user_id) {
                res.redirect('/');
            } else {
                res.render('login', {
                    title: 'Login',
                    layout: false,
                    badLogin: false
                });
            }
        }
    });

    app.post('/login', function (req, res) {
        var post = req.body;

        if (post.inputUser === 'admin' && post.inputPassword === 'recer') {
            req.session.user_id = 'el_admin_id';

            var redirectTo = req.session.redirectTo ? req.session.redirectTo : '/';
            delete req.session.redirectTo;

            res.redirect(redirectTo);
        } else {
            res.render('login', {
                title: 'Login',
                layout: false,
                badLogin: true
            });
        }
    });

    app.get('/logout', function (req, res) {
        delete req.session.user_id;
        res.redirect('/');
    });

    // **************************************************
    // status
    // **************************************************
    app.get('(/|/status)', getLayoutData, function (req, res) {
        if (!req.url.endsWith('/')) {
            req.url += '/';
            res.redirect(req.url);
        } else {
            var db = req.app.locals.db;

            db.getMemoryUsage()
                .then(function (memoryUsage) {
                    res.render('status', {
                        title: 'Status',
                        isAuthed: !!req.session.user_id,
                        memoryUsage: memoryUsage
                    });
                });
        }
    });

    app.get('/memory', function (req, res) {
        var data = {
            x: req.app.locals.moment().tz('Europe/Lisbon').valueOf(),
            y: process.memoryUsage().rss / 1048576
        }

        res.json(data);
    });

    // **************************************************
    // refresh & stop core
    // **************************************************
    app.use('/core', require('./core.js')(checkAuth));

    // **************************************************
    // releases
    // **************************************************
    app.use('/releases', require('./releases.js')(getLayoutData));

    // **************************************************
    // search
    // **************************************************
    app.use('/search', require('./search.js')(getLayoutData));

    // **************************************************
    // verify movie releases & shows
    // **************************************************
    app.use('/verify', require('./verify.js')(checkAuth, getLayoutData));

    // **************************************************
    // log
    // **************************************************
    app.use('/log', require('./log.js')(getLayoutData));

    // **************************************************
    // upsert release/show & delete release
    // **************************************************
    app.put('/release', checkAuth, function (req, res) {
        var db = req.app.locals.db;
        var imdb = req.app.locals.providers.imdb;
        var release = req.body;

        if (release._id && (!release.imdbId || release.imdbId.match(/^tt\d+$/))) {
            Promise.resolve(release.imdbId)
                .then(function (imdbId) {
                    if (!imdbId) {
                        return;
                    } else {
                        return imdb.fetch(release.imdbId)
                            .then(function (imdbInfo) {
                                if (!imdbInfo) throw 'Unable to fetch imdb info.';

                                release.imdbId = imdbInfo._id; // because of imdb redirects

                                return db.upsertIMDb(imdbInfo);
                            });
                    }
                })
                .then(function () {
                    if (typeof release.isVerified != 'undefined') {
                        release.isVerified = parseInt(release.isVerified) || 0;
                    }

                    return db.upsertRelease(release);
                })
                .then(function () {
                    res.status(200).send();
                })
                .catch(function (err) {
                    res.status(400).send(err);
                });
        } else {
            res.status(400).send('Invalid data.');
        }
    });

    app.delete('/release', checkAuth, function (req, res) {
        var db = req.app.locals.db;
        var release = req.body;

        if (release._id) {
            Promise.resolve(db.removeRelease(release))
                .then(function () {
                    res.status(200).send();
                })
                .catch(function (err) {
                    res.status(400).send(err);
                });
        } else {
            res.status(400).send('Invalid data.');
        }
    });

    app.put('/show', checkAuth, function (req, res) {
        var db = req.app.locals.db;
        var imdb = req.app.locals.providers.imdb;
        var show = req.body;

        if (show._id && show.folder && show.imdbId && show.imdbId.match(/^tt\d+$/) && (!show.addic7edId || show.addic7edId.match(/^\d+$/))) {
            imdb.fetch(show.imdbId)
                .then(function (imdbInfo) {
                    if (!imdbInfo) throw 'Unable to fetch imdb info.';

                    show.imdbId = imdbInfo._id; // because of imdb redirects

                    return db.upsertIMDb(imdbInfo);
                })
                .then(function () {
                    show.addic7edId = parseInt(show.addic7edId) || '';
                    show.isVerified = parseInt(show.isVerified) || 0;
                    return db.upsertShow(show);
                })
                .then(function () {
                    res.status(200).send();
                })
                .catch(function (err) {
                    res.status(400).send(err);
                });
        } else {
            res.status(400).send('Invalid data.');
        }
    });

    // **************************************************
    // api
    // **************************************************
    app.use('/api', require('./api.js'));

    // **************************************************
    // subtitle download interface
    // **************************************************
    app.get('/subtitle/*', function (req, res) {
        var common = req.app.locals.common;
        var addic7ed = req.app.locals.providers.addic7ed;
        var subtitle = common.rem(/^\/subtitle\/(.+?)(\/.+)$/i, req.path);

        if (subtitle) {
            addic7ed.download(subtitle[1])
                .then(function (s) {
                    res.attachment(subtitle[0] + '.srt');
                    res.send(s);
                });
        } else {
            res.status(400).send('Invalid subtitle.');
        }
    });

    // **************************************************
    // catch 404 and forward to error handler
    // **************************************************
    app.use(function (req, res) {
        res.status(400);
        res.render('error', {
            message: 'Stop being a smartass!',
            layout: false
        });
    });
};
