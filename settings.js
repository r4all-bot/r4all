'use strict';

module.exports = {
    // delay between each request attempt (retry)
    requestAttemptsInterval: 5 * 1000,

    // number of attempts to try to load a page when using proxies
    loadPageAttempts: parseInt(process.env.APP_LOAD_PAGE_ATTEMPTS || 5),

    // dashboard - # records per page 
    dashboardPageRecords: 50,

    // app - # records per page 
    appPageRecords: 50,

    // core - refesh time interval
    coreRefreshInterval: 5 * 60 * 1000
};