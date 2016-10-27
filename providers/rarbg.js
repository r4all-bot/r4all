'use strict';

var Promise = require('bluebird');
var request = require('request');
var debug = require('debug')('RARBG');
var _ = require('underscore');

var log = require('../logger.js');
var common = require('../common.js');

var RARBG = function () {
    this.URL = 'https://rarbg.to';
    this.SEARCH_URL = this.URL + '/torrents.php?search={s}';
    this.API_URL = 'https://torrentapi.org';
    this.TORRENT_URL = this.API_URL + '/redirect_to_info.php?token={token}&p={torrentId}';

    // status
    this.isOn = true;
};
RARBG.prototype.constructor = RARBG;

var token = null;

var setToken = function () {
    return _.bind(get, this)({ 'get_token': 'get_token' })
        .then(function (res) {
            if (res.hasOwnProperty('token')) {
                token = res.token;
            } else {
                throw 'Unable to fetch token';
            }
        });
};

var get = function (params) {
    var _this = this;

    return new Promise(function (resolve, reject) {
        params = params || {};

        var req = {
            proxy: 'http://93.104.211.51:80',
            uri: _this.API_URL + '/pubapi_v2.php',
            method: 'GET',
            qs: params,
            useQuerystring: true,
            json: true,
            timeout: 10000
        };

        debug(req.uri);

        request(req, function (err, res, data) {
            if (err || res.statusCode != 200) {
                return reject(err || 'Status Code is != 200');
            } else if (!data) {
                return reject('No data returned');
            } else {
                return resolve(data);
            }
        });
    });
};

var query = function (params) {
    var _this = this;

    return Promise.resolve(token || _.bind(setToken, this)())
        .then(function () {
            params.name = 'r4all';
            params.token = token;

            return _.bind(get, _this)(params)
                .then(function (res) {
                    if ([1, 2, 3, 4].indexOf(res['error_code']) > -1) {
                        token = null;
                        return _.bind(query, _this)(params);
                    } else if (res['error_code'] == 5) {
                        return Promise.resolve().delay(2000)
                            .then(function () {
                                return _.bind(query, _this)(params);
                            });
                    } else {
                        return res['torrent_results'];
                    }
                });
        });
};

var fetchTorrent = function (torrents) {
    var torrent = {};

    if (torrents && torrents[0]) {
        torrent = {
            torrentProvider: 'rarbg',
            torrentId: common.rem(/&p=(\w+?)(?:&|$)/, torrents[0].info_page),
            torrentName: torrents[0].title,
            magnetLink: torrents[0].download,
            imdbId: torrents[0].episode_info && torrents[0].episode_info.imdb
        }
    }

    // data validation
    if (!torrent.torrentId || !torrent.magnetLink || !common.getInfohash(torrent.magnetLink)) {
        torrent = null;
    }

    return torrent;
};

RARBG.prototype.fetch = function (releaseName, category) {
    var params = {
        mode: 'search',
        search_string: releaseName,
        sort: 'seeders',
        format: 'json_extended'
    };

    if (category == 'm720p')
        params.category = 45;
    else if (category == 'm1080p')
        params.category = 44;
    else if (category == 's720p')
        params.category = 41;

    var _this = this;

    return _.bind(query, this)(params)
        .then(fetchTorrent)
        .then(function (torrent) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return torrent;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[RARBG] ', err);
            }

            return null;
        });
};

module.exports = new RARBG;
