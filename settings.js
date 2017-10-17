'use strict';

module.exports = {
    // request timeout
    requestTimeout: (parseInt(process.env.APP_REQUEST_TIMEOUT_SECONDS) || 30) * 1000,

    // delay between each request attempt (retry)
    requestAttemptsInterval: (parseInt(process.env.APP_REQUEST_ATTEMPTS_INTERVAL_SECONDS) || 5) * 1000,

    // number of attempts to try to load a page when using proxies
    loadPageAttempts: parseInt(process.env.APP_LOAD_PAGE_ATTEMPTS) || 2,

    bootstrapDatabase: !!parseInt(process.env.APP_BOOTSTRAP_DATABASE),

    // core - refesh time interval
    coreRefreshInterval: (parseInt(process.env.APP_CORE_REFRESH_INTERVAL_MINUTES) || 5) * 60 * 1000,

    // dashboard - # records per page 
    dashboardPageRecords: parseInt(process.env.APP_DASHBOARD_PAGE_RECORDS) || 50,

    // app - # records per page 
    appPageRecords: parseInt(process.env.APP_PAGE_RECORDS) || 50,
};