'use strict';

var debug = require('debug')('Proxy');
var Promise = require('bluebird');
var _ = require('lodash');
var ProxyLists = require('proxy-lists');
var cheerio = require('cheerio');

var common = require('../common.js');

var PROXY = function() {
    //this.sources = null;
};
PROXY.prototype.constructor = PROXY;

// var proxyTester = function(url, validation, proxy) {
//     proxy.url = (proxy.protocols ? proxy.protocols[0] : 'http') + '://' + proxy.ipAddress + ':' + proxy.port;
//     proxy.tunnel = (proxy.tunnel ? true : false);

//     return common.request(url, { proxy: proxy.url, tunnel: proxy.tunnel, json: (validation.type == 'json') })
//         .then(function(resp) {
//             if (validation.type == 'html') {
//                 var $ = cheerio.load(resp);

//                 // validate the page
//                 if (!$(validation.element).length) throw 'site validation failed';
//             } else if (validation.type == 'json') {
//                 // already validated
//             }

//             return { proxy: proxy, resp: resp };
//         });
// };

// var fetchWorkingProxyFromSource = function(url, validation, source) {
//     var gettingProxies = ProxyLists.getProxiesFromSource(source.name, { protocols: ['http', 'https'] });
//     var promiseChain = Promise.resolve();

//     return new Promise(function(resolve, reject) {
//         gettingProxies.on('data', function(proxies) {
//             console.log('data');
//             console.log(proxies.length);
//             promiseChain = promiseChain.then(function(proxy) {
//                     return (proxy && [proxy]) || (proxies.length && _.map(proxies, _.bind(proxyTester, null, url, validation)));
//                 })
//                 .any()
//                 .catch(function(err) {
//                     return null;
//                 });
//         });

//         gettingProxies.on('error', function(error) {
//             // ignore
//         });

//         gettingProxies.once('end', function() {
//             resolve(promiseChain);
//         });
//     });
// };

// var fetchProxy = function(url, validation, i) {
//     i = i || 6;

//     if (!this.sources || !this.sources[i]) throw 'unable to fetch a working proxy';

//     debug('fetching proxy from [' + i + '] ' + this.sources[i].name + '...');

//     var _this = this;

//     return fetchWorkingProxyFromSource(url, validation, this.sources[i])
//         .then(function(proxy) {
//             return proxy || _.bind(fetchProxy, _this)(url, validation, ++i);
//         });
// };



// PROXY.prototype.fetch = function(url, validation) {
//     this.sources = _.filter(ProxyLists.listSources(), function(s) {
//         return !s.requiredOptions.apiKey;
//     });

//     debug('fetching new proxy...');

//     return _.bind(fetchProxy, this)(url, validation);
// };

// #################################################################################
var proxyTester = function(url, validation, proxy) {
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

var fetchWorkingProxy = function(url, validation, proxiesList) {
    debug('fetching a working proxy from ' + proxiesList.length + ' proxies...');

    return Promise.any(_.map(proxiesList, _.bind(proxyTester, null, url, validation)));
};

var fetchProxiesFromSource = function(source) {
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

var fetchProxies = function() {
    var sources = _.filter(ProxyLists.listSources(), function(s) {
        return !s.requiredOptions.apiKey;
    });

    return Promise.map(sources, fetchProxiesFromSource)
        .then(function(proxiesListBySource) {
            return _.uniqBy(_.flatMapDepth(proxiesListBySource, function(proxiesList) {
                return _.map(proxiesList, function(p) {
                    p.url = (p.protocols ? p.protocols[0] : 'http') + '://' + p.ipAddress + ':' + p.port;
                    p.tunnel = (p.tunnel ? true : false);
                    return p;
                });
            }), 'url');
        });
};

PROXY.prototype.fetch = function(url, validation) {
    debug('fetching a new proxy...');
    debug('fetching proxies from source...');

    return fetchProxies()
        .then(_.bind(fetchWorkingProxy, null, url, validation));
};

module.exports = new PROXY;