'use strict';

var debug = require('debug')('Proxy');
var Promise = require('bluebird');
var _ = require('lodash');
var ProxyLists = require('proxy-lists');
var cheerio = require('cheerio');

var common = require('../common.js');

Promise.config({
    cancellation: true
});

var PROXY = function() {};
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
    return common.request(url, { proxy: proxy, tunnel: false, json: (validation.type == 'json') })
        .then(function(resp) {
            if (validation.type == 'html') {
                var $ = cheerio.load(resp);

                // validate the page
                if (!$(validation.element).length) throw 'site validation failed';
            } else if (validation.type == 'json') {
                // already validated
            }

            return { proxy: proxy, resp: resp };
        });
};

var fetchProxy = function(url, validation, i) {
    i = i || 0;

    var sources = _.filter(ProxyLists.listSources(), function(s) {
        return !s.requiredOptions.apiKey;
    });

    if (!sources[i]) throw 'unable to fetch a working proxy';

    debug('fetching proxy from [' + i + '] ' + sources[i].name + '...');

    return fetchProxyListFromSource(sources[i])
        .then(function(proxiesList) {
            if (!proxiesList.length) throw 'proxy list is empty';

            return _.map(_.uniqBy(proxiesList, function(p) { return p.protocols[0] + '://' + p.ipAddress + ':' + p.port; }), function(p) {
                var proxy = p.protocols[0] + '://' + p.ipAddress + ':' + p.port;
                return proxyTester(url, validation, proxy);
            });
        })
        .any()
        .catch(function(err) {
            return fetchProxy(url, validation, ++i);
        });
};

PROXY.prototype.fetch = function(url, validation) {
    debug('fetching new proxy...');

    return fetchProxy(url, validation);
};

module.exports = new PROXY;