'use strict';

process.env.DEBUG = 'Server, Core, Proxy, RARBG, IMDb, Addic7ed, LegendasDivx';

var path = require('path');
var http = require('http');
var debug = require('debug')('Server');
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
    // proxy: require('./providers/proxy.js'),
    // rarbg: require('./providers/rarbg.js'),
    // imdb: require('./providers/imdb.js'),
    // addic7ed: require('./providers/addic7ed.js'),
    // legendasdivx: require('./providers/legendasdivx.js')
};
app.locals._ = require('lodash');
app.locals.moment = require('moment-timezone');

// set server info
app.set('port', process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080);
app.set('ip', process.env.IP || process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(path.join(__dirname, 'public', 'favicon.png')));
app.use(morgan('combined', {
    skip: function(req, res) {
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
        .then(memoryUsage)
        .then(function() {
            return http.createServer(app).listen(app.get('port'), app.get('ip'), function() {
                debug('Express server listening on port ' + app.get('port'));

                return app.locals.core.refresh();
            });
        })
        .catch(function(err) {
            console.log(err);
        });
})();



var rarbg = require('./providers/rarbg.js');

rarbg.fetchReleases().then(function() {
    console.log(Object.keys(rarbg.newReleases).length);
});

// var url = 'https://rarbg.to/torrents.php?category=44%3B45%3B41&page=1';
// var validation = {type: 'html', element: '.lista2t'};

// var url = 'https://torrentapi.org/pubapi_v2.php';
// var validation = {type: 'json'};

// app.locals.providers.proxy.fetch(url, validation).then(function(result){
//     if(result) {
//         console.log(global.proxy);

//         app.locals.providers.rarbg.fetch().then(function(){
//             console.log(app.locals.providers.rarbg.newReleases);
//         });
//     } else {
//         console.log('not found');
//     }
// });