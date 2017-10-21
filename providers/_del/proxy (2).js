'use strict';

var debug = require('debug')('Proxy');
var Promise = require('bluebird');
var _ = require('lodash');
var ProxyLists = require('proxy-lists');
var cheerio = require('cheerio');

var common = require('../common.js');

var PROXY = function() {};
PROXY.prototype.constructor = PROXY;

var proxyTester = function(url, validation, proxy) {
    proxy.url = (proxy.protocols ? proxy.protocols[0] : 'http') + '://' + proxy.ipAddress + ':' + proxy.port;
    proxy.tunnel = (proxy.tunnel ? true : false);

    return common.request(url, { proxy: proxy.url, tunnel: proxy.tunnel, json: (validation.type == 'json') })
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

var fetchProxyListFromSource = function(source) {
    var gettingProxies = ProxyLists.getProxiesFromSource(source.name, { protocols: ['http', 'https'] });
    var proxiesList = [];

    return new Promise(function(resolve, reject) {
        gettingProxies.on('data', function(proxies) {
            proxiesList = proxiesList.concat(proxies);
        });

        gettingProxies.on('error', function(error) {
            // ignore
        });

        gettingProxies.once('end', function() {
            resolve(proxiesList);
        });
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
        .map(_.bind(proxyTester, null, url, validation), { concurrency: 1 })
        .any()
        .catch(function(err) {
            console.log(err);
            return fetchProxy(url, validation, ++i);
        });
};

PROXY.prototype.fetch = function(url, validation) {
    debug('fetching new proxy...');

    return fetchProxy(url, validation);
};

module.exports = new PROXY;