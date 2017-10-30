'use strict';

module.exports = {
    adminPassword: (process.env.APP_ADMIN_PASSWORD || 'admin'),

    bootstrapDatabase: (process.env.APP_BOOTSTRAP_DATABASE && !!parseInt(process.env.APP_BOOTSTRAP_DATABASE)) || true,

    // http request timeout
    requestTimeout: (parseInt(process.env.APP_REQUEST_TIMEOUT_SECONDS) || 60) * 1000,

    // delay between each http request attempt (retry)
    requestAttemptsInterval: (parseInt(process.env.APP_REQUEST_ATTEMPTS_INTERVAL_SECONDS) || 5) * 1000,

    // core - refesh time interval
    coreRefreshInterval: (parseInt(process.env.APP_CORE_REFRESH_INTERVAL_MINUTES) || 5) * 60 * 1000,

    // dashboard - # records per page 
    dashboardPageRecords: parseInt(process.env.APP_DASHBOARD_PAGE_RECORDS) || 50,

    // app - # records per page 
    appPageRecords: parseInt(process.env.APP_PAGE_RECORDS) || 50,
};