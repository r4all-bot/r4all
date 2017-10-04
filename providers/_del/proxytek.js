'use strict';

var debug = require('debug')('Proxy');
var cheerio = require('cheerio');
var _ = require('underscore');

var log = require('../logger.js');
var common = require('../common.js');

var PROXY = function () {
    this.URL = 'http://proxy.tekbreak.com/1000/json';

    // status
    this.isOn = true;
};
PROXY.prototype.constructor = PROXY;

var fetchProxyList = function () {
    var url = this.URL;

    debug(url);

    return common.retry(url)
        .then(JSON.parse);
};

var fetchWorkingProxy = function (proxy, url, validation) {
    var _this = this;

    return common.req(url, proxy)
        .then(function(html) {
            var $ = cheerio.load(html);

            // validate the page
            if (!$(validation).length) {console.log('*f' + proxy); throw 'validation failed!';}

            console.log('**' + proxy);
            return proxy;
        });
};

// var testproxy = function(url, validation, proxyList, i) {
//     var _this = this;

//     i = i || 0;
//     var proxy = proxyList[i];

//     if(!proxy) return;

//     var proxy = 'http://' + proxy.ip + ':' + proxy.port;

//     //console.log('**testing: ' + proxy);

//     return common.req(url, proxy)
//         .then(function(html) {
//             var $ = cheerio.load(html);

//             // validate the page
//             if ($(validation).length) {
//                 console.log(html);
//                 return proxy;
//             } else {
//                 throw 'validation failed!';
//             }
//         })
//         .catch(function (err) {
//             log.error('[Proxy] ', proxy + ': ' + (err.message || err));
//             return testproxy(url, validation, proxyList, ++i);
//         });
// };

PROXY.prototype.fetch = function (url, validation) {
    var _this = this;

// var test = function(t){
//     return Promise.delay(t).then(function(){
//         console.log('asfjhsdjkfhsdf' + t)
//         return t;
//     });
// }

            // var promises = _.map([5000,10000,2000], function(p) {
            //     return _.bind(test, _this)(p);
            // });
// return Promise.resolve()
//         .then(function() {
//             var promises = _.map([5000,10000,2000], function(p) {
//                 return _.bind(test, _this)(p);
//             });
//             return promises;
//         })
//         .any()
//         .then(function(proxy) {
//             console.log(proxy);
//         });







    return _.bind(fetchProxyList, this)()
        // .then(function(proxyList){
        //     return testproxy(url, validation, proxyList)
        // })
        .then(function (proxyList) {
            var promises = _.map(proxyList, function(p) {
                var proxy = 'http://' + p.ip + ':' + p.port;
                return _.bind(fetchWorkingProxy, _this)(proxy, url, validation);
            });

            //console.log(proxyList);
            return promises;
        })
        // .then(function (proxyList) {
        //     var promises = _.map(proxyList, function(p) {
        //         var proxy = p.ip + ':' + p.port;
        //         return _.bind(fetchWorkingProxy, _this)(proxy, url, validation);
        //     });

        //     console.log(proxyList);
        //     return promises;
        // })
        // .map(function (p) {
        //     var proxy = p.ip + ':' + p.port;
        //     return _.bind(fetchWorkingProxy, _this)(proxy, url, validation);
        // })
        .any()
        .then(function(proxy) {
            console.log('succedd!!!!')
            console.log(proxy);
        })
        .then(function () {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return true;
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