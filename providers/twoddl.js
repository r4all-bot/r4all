'use strict';

var debug = require('debug')('TwoDDL');
var cheerio = require('cheerio');
var _ = require('underscore');
var moment = require('moment-timezone');

var log = require('../logger.js');
var common = require('../common.js');

var TwoDDL = function () {
    this.URL = 'http://2ddl.cc';
    this.SEARCH_URL = this.URL + '/?s={s}';
    this.POST_URL = this.URL + '/?p={postId}';

    // status
    this.isOn = true;

    this.lastPost = null;
    this.newLastPost = null;

    this.pending = null;
    this.newReleases = null;
};
TwoDDL.prototype.constructor = TwoDDL;

module.exports = new TwoDDL;
