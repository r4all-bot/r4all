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

    return common.request(url, { proxy: proxy, json: (validation.type == 'json') })
        .then(function(resp) {
            if (validation.type == 'html') {
                var $ = cheerio.load(resp);

                // validate the page
                if (!$(validation.element).length) throw 'site validation failed';
            } else if (validation.type == 'json') {
                // already validated
            }

            return proxy;
        });
};

var fetchProxy = function(url, validation, i) {
    var sources = ProxyLists.listSources();

    if (!sources[i]) i = 0;
    if (!sources[i] || i == this.index) return Promise.resolve(null);
    if (sources[i].requiredOptions.apiKey) return _.bind(fetchProxy, this)(url, validation, ++i);

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
        .then(function(proxy) {
            _this.index = i;
            return proxy;
        })
        .catch(function(err) {
            return _.bind(fetchProxy, _this)(url, validation, ++i);
        });
};

PROXY.prototype.fetch = function(url, validation) {
    debug('fetching new proxy...');

    return _.bind(fetchProxy, this)(url, validation, this.index + 1);
};

module.exports = new PROXY;