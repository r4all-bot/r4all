'use strict';

var debug = require('debug')('Proxy');
var cheerio = require('cheerio');
var _ = require('underscore');
var ProxyLists = require('proxy-lists');

var log = require('../logger.js');
var common = require('../common.js');

var PROXY = function () {
    this.TEKBREAKPROXY_URL = 'http://proxy.tekbreak.com/1000/json';
    this.GIMMEPROXY_URL = 'https://gimmeproxy.com/api/getProxy?get=true&cookies=true&user-agent=true&supportsHttps=true&protocol=http';

    // status
    this.isOn = true;

    this.proxyList = [];
    this.index = 0;
};
PROXY.prototype.constructor = PROXY;

var fetchProxy = function (fproxy) {
    var url = this.GIMMEPROXY_URL;

    debug(url);

    var _this = this;

    return common.req(url, fproxy)
        .then(JSON.parse)
        .catch(function (err) {
            _this.index++;

            var p = _this.proxyList[_this.index++];

            if(p) {
                var proxy = 'http://' + p.ip + ':' + p.port;
                return _.bind(fetchProxy, _this)(proxy);
            } else {
                return null;
            }
        });
};

var fetchProxyList = function () {
    var url = this.TEKBREAKPROXY_URL;

    debug(url);

    return common.req(url)
        .then(JSON.parse);
};

var getProxyFromGimmeProxy = function (url, validation, fproxy) {
    var _this = this;

    return _.bind(fetchProxy, this)(fproxy)
        .then(function (proxy) {
            if(!proxy) return null;

            fproxy = proxy;
            return proxyTester(url, validation, proxy);
        })
        .catch(function (err) {
            return _.bind(getProxyFromGimmeProxy, _this)(url, validation, fproxy);
        });
};

var proxyTester = function (url, validation, proxy) {
    var _this = this;

    return common.req(url, proxy)
        .then(function(html) {
            var $ = cheerio.load(html);

            // validate the page
            if (!$(validation).length) {console.log('*f' + proxy); throw 'site validation failed';}

            console.log('**' + proxy);
            return proxy;
        });
};

PROXY.prototype.fetch = function (url, validation) {
    var _this = this;

    // init
    this.proxyList = [];
    this.index = 0;

    debug('Fetching a new proxy from the Tekbreak Proxy List...')

    return _.bind(fetchProxyList, this)()
        .then(function (proxyList) {
            _this.proxyList = proxyList;

            return _.map(proxyList, function(p) {
                var proxy = 'http://' + p.ip + ':' + p.port;
                return _.bind(proxyTester, _this)(url, validation, proxy);
            });
        })
        .any()
        .catch(function (err) {
            debug('No valid proxy found on the Tekbreak Proxy List!');
            debug('Fetching a new proxy ProxyLists...');

            return new Promise(function (resolve, reject) {
                var gettingProxies = ProxyLists.getProxies();
                var proxiesList = [];

                gettingProxies.on('data', function(proxies) {
                    proxiesList = proxiesList.concat(proxies);
                });

                gettingProxies.on('error', function(error) {
                    console.log('**erro');
                    //console.log(error);
                    //reject(error);
                });

                gettingProxies.once('end', function() {
                    console.log('end');
                    console.log(proxiesList.length);

                    resolve(_.map(proxiesList, function(p) {
                        var proxy = 'http://' + p.ipAddress + ':' + p.port;
                        return _.bind(proxyTester, _this)(url, validation, proxy);
                    }));
                });
            });
        })
        .any()
        .catch(function (err) {
            debug('No valid proxy found on ProxyLists!');
            debug('Fetching a new proxy from GimmeProxy...');
            return _.bind(getProxyFromGimmeProxy, _this)(url, validation);;
        })
        .then(function (proxy) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return proxy;
        })
        .catch(function (err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[Proxy] ', err);
            }

            return false;
        });
};

module.exports = new PROXY;