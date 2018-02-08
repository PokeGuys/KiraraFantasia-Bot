var moment = require('moment')

function debug(message) {
    console.log('[%s] %s', moment().format('YYYY-MM-DD HH:mm:ss'), message)
}

module.exports = debug