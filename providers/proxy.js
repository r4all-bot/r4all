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
    // var i = 0;
    // var currRequests = 0;
    // var done = false;

    debug('fetching a working proxy from ' + proxiesList.length + ' proxies...');

    // return new Promise(function(resolve, reject) {
    //     var checkProxy = function(proxy) {
    //         return proxyTester(url, validation, proxy)
    //             .then(function(result) {
    //                 done = true;
    //                 resolve(result);
    //             })
    //             .catch(function(err) {
    //                 if (!done) {
    //                     if (proxiesList[i]) {
    //                         checkProxy(proxiesList[i]);
    //                         i++;
    //                         currRequests++;
    //                     } else if (currRequests == 1) {
    //                         reject();
    //                     }
    //                 }
    //             });
    //     };

    //     while (currRequests < 10 && proxiesList[i]) {
    //         checkProxy(proxiesList[i]);
    //         i++;
    //         currRequests++;
    //     }
    // });

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
    debug('fetching proxies from sources...');

    return fetchProxies()
        .then(_.bind(fetchWorkingProxy, null, url, validation))
        .catch(function(err) {
            //console.log(err);
            throw 'unable to fetch a working proxy';
        });
};

module.exports = new PROXY;