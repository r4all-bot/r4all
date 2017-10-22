'use strict';

process.env.DEBUG = 'Server, Core, Addic7ed, IMDb, LegendasDivx, RARBG';

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
app.set('port', 8080);
app.set('ip', '0.0.0.0');

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

// var rarbg = require('./providers/rarbg.js')
// rarbg.fetchReleases().then(function(r){console.log(r); console.log(rarbg.newReleases);})






// var Horseman = require("node-horseman");

// var horseman = new Horseman({cookiesFile: 'cookies.txt'});

// horseman
//     .userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0')
//     .open('https://rarbg.to/torrents.php').delay(5000)
//       .html()
//       .then(function(body) {
//         console.log(body);
//         //return horseman.close();
//       })
//       .evaluate( function(){


//             var img = $('img').eq(1)[0];

//             var canvas = document.createElement('canvas');
//             var ctx = canvas.getContext('2d');
//             ctx.drawImage(img, 0, 0);

//             var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

//             var d = pixels.data;
//             for (var i = 0; i < d.length; i += 4) {
//                 var r = d[i];
//                 var g = d[i + 1];
//                 var b = d[i + 2];
//                 var v = 0;

//                 //Extract only gray pixels
//                 //Filter darker pixels (<100)
//                 var diff = Math.abs(r - g) + Math.abs(r - b) + Math.abs(g - b);
//                 var isGray = diff <= 30 && r > 100;
//                 //var isGray = Math.abs(r - g) <= 5 && Math.abs(r - b) <= 5 && Math.abs(g - b) <= 5;

//                 var color = isGray ? 255 : 0;
//                 d[i] = d[i + 1] = d[i + 2] = color;
//             }

//             ctx.putImageData(pixels, 0, 0);

//             //GOCR is a library for OCR
//             //In this simple captchas it is enough
//             var captcha = GOCR(canvas);
//             captcha = captcha.replace(/[\W_]/g, '');

//             $('#solve_string').val(captcha)
//             $('form').submit()
//             return captcha;
//           // This code is executed inside the browser.
//           // It's sandboxed from Node, and has no access to anything
//           // in Node scope, unless you pass it in, like we did with 'selector'.
//           //
//           // You do have access to jQuery, via $, automatically.

//         })
//       .then(function(captcha) {
//         console.log(captcha);
//         //return horseman.close();
//       })
//         .delay(5000)
//         .html()
//       .then(function(body) {
//         console.log(body);
//         return horseman.close();
//       })
























// var sceneRelease = require('scene-release');
// var movieTitle = require('movie-title');
// var Release = require('scene-release-parser');

// // options
// const options = {
//     strict: true, // if no main tags found, will throw an exception
//     defaults: {} // defaults values for : language, resolution and year
// }


// var release = 'Mobile.Suit.Zeta.Gundam.S01.720p.BluRay.x264-CiNEFiLE[rartv]';

// console.log(sceneRelease(release));
// console.log(movieTitle(release));

// var parsed = new Release(release, options);
// console.log(parsed);

// options
// const options = {
//     strict: true, // if no main tags found, will throw an exception
//     defaults: {} // defaults values for : language, resolution and year
// }

// var Release = require('scene-release-parser');
// var _ = app.locals._;

// return app.locals.db.initialize()
//     .then(function() {
//         return app.locals.db.getReleasesToVerify();
//     })
//     .then(function(releases) {
//         console.log('properly tagged...');

//         // properly tagged
//         _.forEach(releases, function(r) {
//             if (r.name.indexOf(r.category.quality) == -1) {
//                 console.log(r.name);
//             }
//         });

//         console.log('obey scene naming rules...');

//         // obey scene naming rules
//         _.forEach(releases, function(r) {
//             if (app.locals.common.regex(/([^a-zA-Z0-9-._() ])/, r.name)) {
//                 console.log(r.name);
//             }
//         });

//         // parsing
//         _.forEach(releases, function(r) {
//             var parsed;

//             try {
//                 parsed = new Release(r.name, options)
//             } catch (err) {
//                 console.log(r.name);
//             }

//             //console.log(parsed);
//         });
//         // var group = app.locals.common.regex(/-([a-zA-Z0-9]+)$/, release.name);
//         // if(!group) {
//         //     console.log(release.name)
//         // }
//     })
//     .then(function() {
//         console.log('done');
//     })



// return app.locals.db.initialize()
//         .then(function() {
//             return app.locals.core.refresh();
//         })
// .then(function() {
//     var fs = require('fs');
//     var releases = fs.readFileSync('releases.json', 'utf8');
//     releases = JSON.parse(releases);
//     console.log(releases.length);
//     return releases;
// })
// .map(function(release) {
//     // release.parsed = common.scene.parseRelease(release);

//     // if (release.category.type = 'show' && release.parsed) {
//     //     release.season = release.parsed.season;
//     //     release.episode = release.parsed.episode;
//     // }

//     // if (!release.imdb || !release.parsed) {
//     //     release.isVerified = false;
//     // }

//     return app.locals.db.upsertRelease(release);
// })
// .then(function() {
//     console.log('done!!!');
// });






// app.locals.db.initialize()
// .then(function(){
//     return app.locals.db.getLastEpisode('tt0898266')
//         .then(function(data){
//             console.log(data);
//         })
//         .catch(function(err) {
//             console.log(err);
//         });    
// });



// var imdb = require('./providers/imdb.js');

// var id = 'tt5071412';
// var type = 'show';

// imdb.fetch(id, type)
//         .then(function(info) {
//             console.log(info);
//         })

// var trakttv = require('./providers/trakttv.js');
// var mdb = require('./providers/themoviedb.js');

// var id = 'tt5071412';
// var type = 'show';

// trakttv.fetch(id, type)
//         .then(function(newInfo) {
//             console.log(newInfo);

//             return mdb.fetch(id, type);
//         })
//         .then(function(newInfo) {
//             console.log(newInfo);
//             console.log(newInfo.tv_episode_results);
//             console.log(newInfo.tv_season_results);
//         });



// var rarbg = require('./providers/rarbg.js');

// rarbg.fetchReleases().then(function() {
//     console.log(Object.keys(rarbg.newReleases).length);
// });

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