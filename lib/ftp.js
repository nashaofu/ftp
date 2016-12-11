/*!
 * FTP
 * Copyright(c) 2016 程刁
 * MIT Licensed
 */
'use strict';

const fs = require('fs');
const Socket = require('net').Socket;
const Emitter = require('events');
const CMD = require('./cmd');
/**
 * Expose Server class.
 * Inherits from Emitter.
 */
exports = module.exports = class FTP extends Emitter {
    constructor(options) {
        super();
        if ('object' !== typeof options) {
            options = Object.create(null);
        }
        this.options = {
            host: options.host || undefined,
            port: options.port || 21,
            type: options.type || 'ftp',
            user: options.user || undefined,
            password: options.password || undefined,
            keepalive: options.keepalive || 10000,
            timeout: options.timeout || 30000
        };
        // CMD命令队列对象
        this.cmd = new CMD();
        // socket对象
        this.socket = new Socket();
        // 数据缓存变量
        this.buffer = '';
        // 是否正在登录
        this.logging = false;
        // 是否登陆
        this.logged = false;
        // 是否正在请求
        this.pending = false;

        // 设置不触发超时
        this.socket.setTimeout(0);
        // 设置编码
        this.socket.setEncoding('binary');
        // 错误处理事件
        this.on('error', this.onerror);
        this.socket.on('data', (data) => this.ondata(data));
        this.socket.on('close', () => this.onclose());
        this.socket.on('end', () => this.onend());
        this.socket.on('error', (error) => this.emit('error', error));
        // 连接服务器
        this.connect();
    }
    connect() {
        this.socket.connect(this.options.port, this.options.host);
        this.pending = true;
    }
    next() {
        if (this.pending) {
            return;
        }
        if (!this.logged && !this.logging) {
            this.user();
            return;
        }
        this._timeout && clearTimeout(this._timeout);
        let cmd = this.cmd.next();
        if (cmd) {
            this._keepalive && clearTimeout(this._keepalive);
            this.send(cmd);
        } else {
            this.keepalive();
        }
    }
    send(cmd) {
        if (!cmd) {
            return;
        }
        if (this.pending) {
            return;
        }
        this.pending = true;
        this.socket.write(cmd);
        // 回车换行符
        this.socket.write(new Buffer([13, 10]));
    }
    ondata(data) {
        this.buffer += data;
        let res = /(?:^|\r?\n)(\d{3}) [^\r\n]*\r?\n$/.exec(this.buffer);
        if (res) {
            let _regExp = `(^|\\r?\\n)${res[1]}(?: |\\-)`;
            _regExp = RegExp(_regExp, 'g');
            this.buffer = this.buffer.replace(_regExp, '$1').trim();
            let _res = {
                status: parseInt(res[1], 10),
                msg: res[0].replace(/\r\n/g, ''),
                data: this.buffer
            }
            this.buffer = '';
            if (_res.status === 230) {
                this.logging = false;
                this.logged = true;
            }
            let err = null;
            if (_res.status >= 400) {
                // 服务器有错误
                this.emit('error', this.throw(_res));
            }
            this.pending = false;
            let fn = this.cmd.getCurrentFn();
            let next = false;
            if (fn) {
                next = fn(err, _res);
            }
            if (!next) {
                return this.next();
            }
        }
    }
    onclose() {
        console.log('The ftp has been closeed');
    }
    keepalive() {
        this._keepalive = setTimeout(() => {
            this.noop();
        }, this.options.keepalive);
    }
    noop(callback) {
        this.cmd.append({
            cmd: 'NOOP',
            fn: callback
        });
        this.next();
        return this;
    }
    user(user, callback) {
        user = user || this.options.user;
        if (!user) {
            this.emit('error', this.throw('The user is required'));
            return;
        }
        if (this.logging) {
            return;
        }
        this.logging = true;
        var me = this;
        this.cmd.append({
            cmd: `USER ${user}`,
            fn: function (error, data) {
                if (error) {
                    return;
                }
                if (data.status === 331) {
                    if (!me.options.password) {
                        me.emit('error', me.throw(data));
                    }
                    me.pass();
                    callback && callback(error, data);
                    return true;
                }
                callback && callback(error, data);
            }
        }, true);
        this.next();
        return this;
    }
    pass(pass, callback) {
        pass = pass || this.options.password;
        if (!pass) {
            return;
        }
        this.cmd.append({
            cmd: `PASS ${pass}`,
            fn: callback
        }, true);
        this.next();
        return this;
    }
    feat(callback) {
        this.cmd.append({
            cmd: 'FEAT',
            fn: callback
        });
        this.next();
        return this;
    }
    type(callback) {
        this.cmd.append({
            cmd: 'TYPE I',
            fn: callback
        });
        this.next();
        return this;
    }
    cwd(path, callback) {
        this.cmd.append({
            cmd: `CWD ${path}`,
            fn: callback
        });
        this.next();
        return this;
    }
    delete(path, callback) {
        this.cmd.append({
            cmd: `DELE ${path}`,
            fn: callback
        });
        this.next();
        return this;
    }
    rmd(path, callback) {
        this.cmd.append({
            cmd: `RMD ${path}`,
            fn: callback
        });
        return this;
    }
    mkdir(path, callback) {
        this.cmd.append({
            cmd: `MKD ${path}`,
            fn: callback
        });
        this.next();
        return this;
    }
    rename(path1, path2, callback) {
        this.cmd.append([{
            cmd: `RNFR ${path1}`,
            fn: callback
        }, {
            cmd: `RNTO ${path2}`,
            fn: callback
        }]);
        this.next();
        return this;
    }
    status(path, callback) {
        let fn = function (error, data) {
            let status = data.data.split(/\r\n/g);
            status.shift();
            status.pop();
            let _status = [];
            for (let i = 0, length = status.length; i < length; i++) {
                var temp = {
                    lastmodify: status[i].match(/[0-1]{0,1}[0-9]-[0-3]{0,1}[0-9]-[0-9][0-9] +[0-1]{0,1}[0-2]:[0-5]{0,1}[0-9](PM|AM)/i)[0],
                    name: status[i].match(/([a-z0-9]|[.]|[-]|[_])+$/i)[0]
                };
                temp.lastmodify = temp.lastmodify.replace(/\s+/, ' ');
                status[i] = status[i].replace(/(^\s*)|(\s*$)/, '');
                if (status[i].toUpperCase().indexOf('<DIR>') !== -1) {
                    temp.type = 'directory';
                    temp.size = 0;
                } else {
                    temp.type = 'file';
                    temp.size = status[i].match(/\d+\s+([a-z0-9]|[.]|[-]|[_])+$/i)[0]
                    temp.size = temp.size.split(/\s+/)[0];
                }
                _status.push(temp);
            }
            callback && callback(error, _status);
        }
        if (path) {
            this.cmd.append({
                cmd: `STAT ${path}`,
                fn: fn
            });
        } else {
            this.cmd.append({
                cmd: 'STAT',
                fn: fn
            });
        }
        this.next();
        return this;
    }
    list(path, callback) {
        if (path) {
            this.cmd.append({
                cmd: `LIST ${path}`,
                fn: callback
            });
        } else {
            this.cmd.append({
                cmd: 'LIST',
                fn: callback
            });
        }
        this.next();
        return this;
    }
    stor(path, callback) {
        var me = this;
        this.pasv(function (socket) {
            me.cmd.append({
                cmd: `STOR ${path}`,
                fn: function (error, data) {
                    if (error) {
                        return;
                    }
                    if (data.status === 150 || data.status === 125) {
                        fs.stat(path, function (err, stats) {
                            if (err) {
                                socket.end(path);
                            } else {
                                let stream = fs.createReadStream(path);
                                stream.on('end', function () {
                                    callback(null, {
                                        status: 1,
                                        msg: 'stor is ok',
                                        data: null
                                    });
                                });
                                stream.on('error', function (_error) {
                                    callback(_error);
                                });
                                stream.pipe(socket);
                            }
                        });
                    }
                }
            }, true);
            me.next();
        });

        this.next();
        return this;
    }
    pasv(callback) {
        var me = this;
        this.cmd.append({
            cmd: 'PASV',
            fn: function (error, data) {
                if (error) {
                    return;
                }
                let res = /([\d]+),([\d]+),([\d]+),([\d]+),([-\d]+),([-\d]+)/.exec(data.data);
                let ip = `${res[1]}.${res[2]}.${res[3]}.${res[4]}`;
                let port = parseInt(res[5], 10) * 256 + parseInt(res[6], 10);
                me.pasvConnect(ip, port, callback);
                return true;
            }
        });
        this.next();
        return this;
    }
    pasvConnect(ip, port, callback) {
        let socket = new Socket();
        socket.setTimeout(0);
        socket.setEncoding('binary');
        socket.on('error', (error) => this.emit('error', error));
        socket.connect(port, ip);
        callback && callback(socket);
        this.next();
        return this;
    }
    onend() {
        this.socket.destroy();
    }
    throw(err) {
        if ('string' === typeof err) {
            err = {
                msg: err,
                status: 0
            }
        }
        var error = new Error(err.msg);
        error.status = err.status;
        return error;
    }
    onerror(error) {
        const msg = error.toString();
        console.error(msg);
    }
}