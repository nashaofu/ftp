/*!
 * FTP util
 * Copyright(c) 2016 程刁
 * MIT Licensed
 */
'use strict';
const XRegExp = require('xregexp');
var REX_LISTUNIX = XRegExp.cache('^(?<type>[\\-ld])(?<permission>([\\-r][\\-w][\\-xs]){3})\\s+(?<inodes>\\d+)\\s+(?<owner>\\w+)\\s+(?<group>\\w+)\\s+(?<size>\\d+)\\s+(?<timestamp>((?<month1>\\w{3})\\s+(?<date1>\\d{1,2})\\s+(?<hour>\\d{1,2}):(?<minute>\\d{2}))|((?<month2>\\w{3})\\s+(?<date2>\\d{1,2})\\s+(?<year>\\d{4})))\\s+(?<name>.+)$'),
    REX_LISTMSDOS = XRegExp.cache('^(?<month>\\d{2})(?:\\-|\\/)(?<date>\\d{2})(?:\\-|\\/)(?<year>\\d{2,4})\\s+(?<hour>\\d{2}):(?<minute>\\d{2})\\s{0,1}(?<ampm>[AaMmPp]{1,2})\\s+(?:(?<size>\\d+)|(?<isdir>\\<DIR\\>))\\s+(?<name>.+)$'),
    REX_TIMEVAL = XRegExp.cache('^(?<year>\\d{4})(?<month>\\d{2})(?<date>\\d{2})(?<hour>\\d{2})(?<minute>\\d{2})(?<second>\\d+)(?:.\\d+)?$'),
    RE_PASV = /([\d]+),([\d]+),([\d]+),([\d]+),([-\d]+),([-\d]+)/,
    RE_EOL = /\r?\n/g,
    RE_CWD = /"(.+)"(?: |$)/,
    RE_PWD = /^"(.+)"(?: |$)/,
    RE_SYST = /^([^ ]+)(?: |$)/,
    RE_RES_END = /(?:^|\r?\n)(\d{3}) [^\r\n]*\r?\n/;

var MONTHS = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12
},
    TYPE = {
        SYNTAX: 0,
        INFO: 1,
        SOCKETS: 2,
        AUTH: 3,
        UNSPEC: 4,
        FILESYS: 5
    },
    RETVAL = {
        PRELIM: 1,
        OK: 2,
        WAITING: 3,
        ERR_TEMP: 4,
        ERR_PERM: 5
    },
exports = module.exports = {
    parseListEntry: function (line) {
        var ret,
            info,
            month,
            day,
            year,
            hour,
            mins;

        if (ret = XRegExp.exec(line, REX_LISTUNIX)) {
            info = {
                type: ret.type,
                name: undefined,
                target: undefined,
                rights: {
                    user: ret.permission.substr(0, 3).replace(/\-/g, ''),
                    group: ret.permission.substr(3, 3).replace(/\-/g, ''),
                    other: ret.permission.substr(6, 3).replace(/\-/g, '')
                },
                owner: ret.owner,
                group: ret.group,
                size: parseInt(ret.size, 10),
                date: undefined
            };
            if (ret.month1 !== undefined) {
                month = parseInt(MONTHS[ret.month1.toLowerCase()], 10);
                day = parseInt(ret.date1, 10);
                year = (new Date()).getFullYear();
                hour = parseInt(ret.hour, 10);
                mins = parseInt(ret.minute, 10);
                if (month < 10)
                    month = '0' + month;
                if (day < 10)
                    day = '0' + day;
                if (hour < 10)
                    hour = '0' + hour;
                if (mins < 10)
                    mins = '0' + mins;
                info.date = new Date(year + '-' + month + '-' + day +
                    'T' + hour + ':' + mins);
            } else if (ret.month2 !== undefined) {
                month = parseInt(MONTHS[ret.month2.toLowerCase()], 10);
                day = parseInt(ret.date2, 10);
                year = parseInt(ret.year, 10);
                if (month < 10)
                    month = '0' + month;
                if (day < 10)
                    day = '0' + day;
                info.date = new Date(year + '-' + month + '-' + day);
            }
            if (ret.type === 'l') {
                var pos = ret.name.indexOf(' -> ');
                info.name = ret.name.substring(0, pos);
                info.target = ret.name.substring(pos + 4);
            } else
                info.name = ret.name;
            ret = info;
        } else if (ret = XRegExp.exec(line, REX_LISTMSDOS)) {
            info = {
                name: ret.name,
                type: (ret.isdir ? 'd' : '-'),
                size: (ret.isdir ? 0 : parseInt(ret.size, 10)),
                date: undefined,
            };
            month = parseInt(ret.month, 10),
                day = parseInt(ret.date, 10),
                year = parseInt(ret.year, 10),
                hour = parseInt(ret.hour, 10),
                mins = parseInt(ret.minute, 10);

            if (year < 70)
                year += 2000;
            else
                year += 1900;

            if (ret.ampm[0].toLowerCase() === 'p' && hour < 12)
                hour += 12;
            else if (ret.ampm[0].toLowerCase() === 'a' && hour === 12)
                hour = 0;

            info.date = new Date(year, month - 1, day, hour, mins)

            ret = info;
        } else
            ret = line; // could not parse, so at least give the end user a chance to
        // look at the raw listing themselves

        return ret;
    }
}