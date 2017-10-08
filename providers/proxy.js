'use strict';

var Promise = require('bluebird');
var debug = require('debug')('Proxy');
var cheerio = require('cheerio');
var _ = require('lodash');
var ProxyLists = require('proxy-lists');

var log = require('../logger.js');
var common = require('../common.js');

var PROXY = function() {
    this.index = 0;
};
PROXY.prototype.constructor = PROXY;

var fetchProxyListFromSource = function(source) {
    var gettingProxies = ProxyLists.getProxiesFromSource(source.name, { protocols: ['http', 'https'], tunnel: false });
    var proxiesList = [];

    return new Promise(function(resolve, reject) {
        gettingProxies.on('data', function(proxies) {
            proxiesList = proxiesList.concat(proxies);
        });

        gettingProxies.on('error', function(error) {
            reject(error);
        });

        gettingProxies.once('end', function() {
            resolve(proxiesList);
        });
    });
};

var proxyTester = function(url, validation, proxy) {
    var _this = this;

    return common.req(url, null, { proxy: proxy, json: (validation.type == 'json') })
        .then(function(resp) {
            if (validation.type == 'html') {
                var $ = cheerio.load(resp);

                // validate the page
                if (!$(validation.element).length) throw 'site validation failed';
            } else if (validation.type == 'xml') {
                var $ = cheerio.load(resp, {
                    normalizeWhitespace: true,
                    xmlMode: true,
                    lowerCaseTags: true
                });

                // validate the page
                if (!$(validation.element).length) throw 'site validation failed';
            } else if (validation.type == 'json') {
                // already validated
            }

            return { proxy: proxy, resp: resp };
        });
};

var fetchProxy = function(url, validation, i) {
    var stop;
    var sources = _.filter(ProxyLists.listSources(), function(s) {
        return !s.requiredOptions.apiKey;
    });

    if (!sources[i]) i = 0;
    if (!sources[i]) throw 'proxy sources are empty';
    if (i == this.index) stop = true;

    debug('fetching proxy from [' + i + '] ' + sources[i].name + '...');

    var _this = this;

    return fetchProxyListFromSource(sources[i])
        .then(function(proxiesList) {
            if (!proxiesList.length) return;

            return _.map(_.uniqBy(proxiesList, function(p) { return 'http://' + p.ipAddress + ':' + p.port; }), function(p) {
                var proxy = 'http://' + p.ipAddress + ':' + p.port;
                return _.bind(proxyTester, _this)(url, validation, proxy);
            });
        })
        .any()
        .catch(function(err) {
            if (stop) {
                debug('unable to fetch a working proxy');
                throw 'unable to fetch a working proxy';
            }

            return _.bind(fetchProxy, _this)(url, validation, ++i);
        })
        .then(function(result) {
            _this.index = i;
            return result;
        });
};

PROXY.prototype.fetch = function(url, validation) {
    debug('fetching new proxy...');

    return _.bind(fetchProxy, this)(url, validation, this.index + 1);
};

module.exports = new PROXY;