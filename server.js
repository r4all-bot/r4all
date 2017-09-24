'use strict';

process.env.DEBUG = 'server, core, DDLValley, ReleaseBB, TwoDDL, NFOmation, IMDb, TraktTv, TMDb, KickassTorrents, RARBG, ThePirateBay, Addic7ed, LegendasDivx';

var path = require('path');
var http = require('http');
var debug = require('debug')('server');
var express = require('express');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var expressLayouts = require('express-ejs-layouts');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');

var app = express();

// set express locals
app.locals.startupTime = require('moment-timezone')().tz('Europe/Lisbon');
app.locals.settings = require('./settings.js');
app.locals.common = require('./common.js');
app.locals.db = require('./database.js');
app.locals.core = require('./core.js');
app.locals.providers = {
    ddlvalley: require('./providers/ddlvalley.js'),
    rlsbb: require('./providers/rlsbb.js'),
    twoddl: require('./providers/twoddl.js'),
    nfomation: require('./providers/nfomation.js'),
    imdb: require('./providers/imdb.js'),
    trakttv: require('./providers/trakttv.js'),
    themoviedb: require('./providers/themoviedb.js'),
    kickasstorrents: require('./providers/kickasstorrents.js'),
    rarbg: require('./providers/rarbg.js'),
    thepiratebay: require('./providers/thepiratebay.js'),
    addic7ed: require('./providers/addic7ed.js'),
    legendasdivx: require('./providers/legendasdivx.js')
};
app.locals._ = require('underscore');
app.locals.moment = require('moment-timezone');

// set server info
app.set('port', 8080);
app.set('ip', '0.0.0.0');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(path.join(__dirname, 'public', 'favicon.png')));
app.use(morgan('combined', {
    skip: function (req, res) {
        return res.statusCode < 400;
    }
}));
app.use(expressLayouts);
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser());
app.use(session({
    secret: '$#%!@#@@#SSDASASDVV@@@@',
    key: 'sid',
    resave: true,
    saveUninitialized: true
}));
app.use(express.static(path.join(__dirname, 'public')));

require('./routes')(app);

function memoryUsage() {
    var data = {
        date: app.locals.moment().tz('Europe/Lisbon').toDate(),
        rss: process.memoryUsage().rss
    };

    return app.locals.db.insertMemoryUsage(data)
        .then(setTimeout(memoryUsage, 15 * 60 * 1000));
};

(function initApp() {
    app.locals.db.initialize()
        .then(app.locals.db.setSettings)
        .then(memoryUsage)
        .then(function () {
            return http.createServer(app).listen(app.get('port'), app.get('ip'), function () {
                debug('Express server listening on port ' + app.get('port'));

                // global.proxy = 'http://138.201.63.123:31288';
                // app.locals.providers.rarbg.fetch('The.Blacklist.S04E15.720p.HDTV.x264-SVA', 's720p')
                //     .then(function(result){
                //         console.log(result);
                //     });

                return app.locals.core.refresh();
            });
        })
        .catch(function (err) {
            console.log(err);
        });
})();
