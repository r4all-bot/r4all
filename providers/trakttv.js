'use strict';

var Promise = require('bluebird');
var debug = require('debug')('TraktTv');
var URI = require('urijs');
var request = require('request');

var log = require('../logger.js');

var API_ENDPOINT = URI('https://api-v2launch.trakt.tv');
var CLIENT_ID = 'c7e20abc718e46fc75399dd6688afca9ac83cd4519c9cb1fba862b37b8640e89';
var STATUS_CODES = {
    '400': 'Bad Request - request couldn\'t be parsed',
    '401': 'Unauthorized - OAuth must be provided',
    '403': 'Forbidden - invalid API key or unapproved app',
    '404': 'Not Found - method exists, but no record found',
    '405': 'Method Not Found - method doesn\'t exist',
    '409': 'Conflict - resource already created',
    '412': 'Precondition Failed - use application/json content type',
    '422': 'Unprocessable Entity - validation errors',
    '429': 'Rate Limit Exceeded',
    '500': 'Server Error',
    '503': 'Service Unavailable - server overloaded',
    '520': 'Service Unavailable - Cloudflare error',
    '521': 'Service Unavailable - Cloudflare error',
    '522': 'Service Unavailable - Cloudflare error'
};

var TraktTv = function () {
    this.URL = 'https://twitter.com/traktapi';

    // status
    this.isOn = true;
};
TraktTv.prototype.constructor = TraktTv;

var fetchMedia = function (obj) {
    var media = {};

    // validation
    if ('images' in obj && 'trailer' in obj) {
        media.cover = obj.images.poster.full;
        media.backdrop = obj.images.fanart.full;
        media.trailer = obj.trailer;
        media.state = obj.status;
    }

    return media;
};

/*
 * Trakt v2
 * METHODS (http://docs.trakt.apiary.io/)
 */

var get = function (endpoint, getVariables) {
    return new Promise(function (resolve, reject) {
        getVariables = getVariables || {};

        var requestUri = API_ENDPOINT.clone()
            .segment(endpoint)
            .addQuery(getVariables);

        debug(requestUri.toString());

        request({
            method: 'GET',
            url: requestUri.toString(),
            headers: {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': CLIENT_ID
            }
        }, function (error, response, body) {
            if (error || !body) {
                reject(error || 'no body');
            } else if (response.statusCode >= 400) {
                reject(response.statusCode + ': ' + STATUS_CODES[response.statusCode]);
            } else {
                var res = {};

                try {
                    res = JSON.parse(body);
                } catch (e) {}

                resolve(res);
            }
        });
    });
};

TraktTv.prototype.resizeImage = function (imageUrl, size) {
    if (!imageUrl) {
        return imageUrl;
    }

    var uri = URI(imageUrl),
        ext = uri.suffix(),
        file = uri.filename().split('.' + ext)[0];

    // Don't resize images that don't come from trakt
    //  eg. YTS Movie Covers
    if (imageUrl.indexOf('placeholders/original/fanart') !== -1) {
        return 'images/bg-header.jpg'.toString();
    } else if (imageUrl.indexOf('placeholders/original/poster') !== -1) {
        return 'images/posterholder.png'.toString();
    } else if (uri.domain() !== 'trakt.us') {
        return imageUrl;
    }

    var existingIndex = 0;
    if ((existingIndex = file.search('-\\d\\d\\d$')) !== -1) {
        file = file.slice(0, existingIndex);
    }

    // reset
    uri.pathname(uri.pathname().toString().replace(/thumb|medium/, 'original'));

    if (size === 'thumb') {
        uri.pathname(uri.pathname().toString().replace(/original/, 'thumb'));
    } else if (size === 'medium') {
        uri.pathname(uri.pathname().toString().replace(/original/, 'medium'));
    } else {
        //keep original
    }

    return uri.filename(file + '.' + ext).toString();
};

TraktTv.prototype.fetch = function (imdbId, type) {
    var _this = this;

    return get(type + 's/' + imdbId, {
            extended: 'full,images'
        })
        .then(fetchMedia)
        .then(function (media) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return media;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[TraktTv] ', err);
            }

            return null;
        });
};

module.exports = new TraktTv;
