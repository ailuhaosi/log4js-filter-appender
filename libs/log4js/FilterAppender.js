/**
 * log4jsExt FilterAppender
 * Created by pengj on 2017-3-22.
 */
'use strict';
const log4js = require('log4js');
const levels = log4js.levels;
const util = require('util');

const pm2 = require('../pm2/PM2Listener');

function formatLogData(logData) {
    let data = logData;
    if (!Array.isArray(data)) {
        let numArgs = arguments.length;
        data = new Array(numArgs);
        for (let i = 0; i < numArgs; i++) {
            data[i] = arguments[i];
        }
    }
    return util.format.apply(util, data);
}

class AppenderFilter {

    constructor() {
        this.enable = false;
        this.level = levels.toLevel('info');
        this.filter = undefined;
        this.category = undefined;
        this.orgLevel = undefined;
        this.isForceChanged = false;
    }


    isEnableLevel(level) {
        if (this.level) {
            return level.isGreaterThanOrEqualTo(this.level);
        } else {
            return true;
        }
    }

    isEnableCategory(category) {
        if (this.category) {
            return this.category === category;
        } else {
            return true;
        }
    }

    isEnableFilter(data) {
        if (this.filter) {
            let message = formatLogData(data);
            return this.filter.test(message);
        } else {
            return true;
        }
    }

    isEnable(loggingEvent) {
        return this.enable && this.isEnableCategory(loggingEvent.categoryName) && this.isEnableLevel(loggingEvent.level) && this.isEnableFilter(loggingEvent.data);
    }

    startFilter(config) {
        this.category = config.category;

        if (config.filter) {
            this.filter = new RegExp(config.filter);
        }

        this.level = config.level;
        if (this.level && config.forceLevel) {
            this.changeLevel();
        }

        this.enable = true;
        console.log('switch filter, filter: %s\tlevel:%s\tcategory:%s\tforceLevel:%s', this.filter, this.level, this.category, config.forceLevel);
    }

    changeLevel() {
        this.recoverLevel();

        if (this.category) {
            let logger = log4js.getLogger(this.category);
            if (!logger.isLevelEnabled(this.level)) {
                if (logger.hasOwnProperty('level')) {
                    this.orgLevel = logger.level;
                }
                logger.setLevel(this.level);
                this.isForceChanged = true;
            }
        }
    }


    recoverLevel() {
        if (this.category && this.isForceChanged) {
            let logger = log4js.getLogger(this.category);
            if (this.orgLevel) {
                logger.setLevel(this.orgLevel);
                this.orgLevel = undefined;
            } else {
                logger.removeLevel();
            }
            this.isForceChanged = false;
        }
    }


    stopFilter() {
        this.enable = false;

        this.recoverLevel();

        this.level = levels.toLevel('error');
        this.filter = undefined;
        this.category = undefined;
    }

    showFilter() {
        console.log('filter: %s\tlevel:%s\tcategory:%s', this.filter, this.level, this.category);
    }
}

function getWorkAppender(appenderConfig, options) {
    log4js.loadAppender(appenderConfig.type);
    let appender = log4js.appenderMakers[appenderConfig.type](
            appenderConfig,
            options
    );
    return appender;
}


//TODO 增加其他通道 listeners
function createAppender(appender, listeners) {
    let filter = new AppenderFilter();

    pm2.listener(filter);

    return function (loggingEvent) {
        try {
            if (filter.isEnable(loggingEvent)) {
                appender(loggingEvent);
            }
        } catch (err) {
            console.error('FilterAppender error', err);
            filter.stopFilter();
        }
    };
}


exports.appender = function (appenderConfig, listeners) {
    let appender = getWorkAppender(appenderConfig);
    return createAppender(appender, listeners);
};

exports.configure = function (config, options) {
    let appender = getWorkAppender(config.appender);
    return createAppender(appender, config.listeners);
};
