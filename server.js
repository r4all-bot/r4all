'use strict';

process.env.DEBUG = 'Server, Core, Addic7ed, IMDb, LegendasDivx, Proxy, RARBG';

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


//require('./providers/rarbg.js').fetchReleases().then(function(r){console.log(r)})



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