'use strict';

var debug = require('debug')('ReleaseBB');
var cheerio = require('cheerio');
var _ = require('underscore');
var moment = require('moment-timezone');

var log = require('../logger.js');
var common = require('../common.js');

var ReleaseBB = function () {
    this.URL = 'http://rlsbb.com';
    this.SEARCH_URL = this.URL + '/?s={s}';
    this.POST_URL = this.URL + '/?p={postId}';

    // status
    this.isOn = true;

    this.lastPost = null;
    this.newLastPost = null;

    this.pending = null;
    this.newReleases = null;
};
ReleaseBB.prototype.constructor = ReleaseBB;

module.exports = new ReleaseBB;
