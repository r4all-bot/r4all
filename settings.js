'use strict';

module.exports = {
    // dashboard - # records per page 
    dashboardPageRecords: 10,

    // app - # records per page 
    appPageRecords: 50,

    // core - refesh time interval
    refreshInterval: 15 * 60 * 1000,

    // request attempts
    attempts: 5, // # of retrys
    attemptsInterval: 5 * 1000 // time interval between each retry
};
