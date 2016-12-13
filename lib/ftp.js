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
    /**
     * 连接ftp服务器
     * 并把请求状态pending设置为true
     * @return {[type]} [description]
     */
    connect() {
        this.socket.connect(this.options.port, this.options.host);
        this.pending = true;
    }
    /**
     * 执行下一条命令
     * 如果上一条命令还没有返回结果
     * 则不会执行下一条语句
     * 
     * 如果用户没有登陆，则调用用户登录
     * @return {Function} [description]
     */
    next() {
        if (this.pending) {
            return;
        }
        /**
         * 如果用户没有登录并且也不处于登录中
         * 则调用用户登录
         */
        if (!this.logged && !this.logging) {
            this.user();
            return;
        }
        // 清除超时信息
        this._timeout && clearTimeout(this._timeout);
        // 获取下一条命令
        let cmd = this.cmd.next();
        /**
         * 假如命令队列被执行完之后
         * 发送NOOP命令以保持长连接
         */
        if (cmd) {
            /**
             * 清除长连接timer
             * 停止发送NOOP命令
             */
            this._keepalive && clearTimeout(this._keepalive);
            this.send(cmd);
        } else {
            this.keepalive();
        }
        return this;
    }
    /**
     * 发送一个命令到服务器
     * @param  {[type]} cmd [description]
     * @return {[type]}     [description]
     */
    send(cmd) {
        if (!cmd) {
            return;
        }
        /**
         * 假如上一个命令没有返回响应
         * 则停止执行
         */
        if (this.pending) {
            return;
        }
        // 把pending设置为true
        this.pending = true;
        this.socket.write(cmd);
        // 回车换行符
        this.socket.write(new Buffer([13, 10]));
        return this;
    }
    /**
     * 服务器响应处理
     * 把响应信息包装为
     * response = {
     *     status: response status,
     *     msg: response msg,
     *     data: response
     * }
     * 并且控制必须在返回一个完整的响应才执行下一条命令
     * 如果命令的回调函数返回值为true
     * 则不会立即执行命令队列中的下一条语句
     * 而是先执行回调函数里面的语句
     * 以保证命令之间的相互依赖关系正确
     * @param  {[type]} data [description]
     * @return {[type]}      [description]
     */
    ondata(data) {
        /**
         * 由于返回是数据流
         * 所以把响应数据缓存起来
         * 直到响应完成时再处理
         */
        this.buffer += data;
        let res = /(?:^|\r?\n)(\d{3}) [^\r\n]*\r?\n$/.exec(this.buffer);
        // 当一个命令响应完整的返回时执行
        if (res) {
            let _regExp = `(^|\\r?\\n)${res[1]}(?: |\\-)`;
            _regExp = RegExp(_regExp, 'g');
            // 规范返回数据
            this.buffer = this.buffer.replace(_regExp, '$1').trim();
            // 把返回信息包装为新对象
            let _res = {
                status: parseInt(res[1], 10),
                msg: res[0].replace(/\r\n/g, ''),
                data: this.buffer
            }
            // 清空响应缓存
            this.buffer = '';
            // 当登陆成功后
            // 把logging变为false
            // 把logged设置为true
            if (_res.status === 230) {
                this.logging = false;
                this.logged = true;
            }
            // 定义错误
            let err = null;
            if (_res.status >= 400) {
                // 服务器有错误
                this.emit('error', this.throw(_res));
            }
            // 把pending设置为false
            // 从而让下一条命令能正常执行
            this.pending = false;
            // 获取当前命令的回调函数
            let fn = this.cmd.getCurrentFn();
            // 存储回调函数的返回值
            let next = false;
            // 执行回调
            if (fn) {
                next = fn(err, _res);
            }
            // 如果没有返回true
            // 则执行命令队列的下一条命令
            if (!next) {
                this.next();
            }
        }
        return this;
    }
    /**
     * ftp关闭事件处理函数
     * @return {[type]} [description]
     */
    onclose() {
        console.log('The ftp has been closeed');
    }
    /**
     * 保持长连接
     * @return {[type]} [description]
     */
    keepalive() {
        // 设置延时发送NOOP命令
        // 并把timer赋值给_keepalive
        this._keepalive = setTimeout(() => {
            this.noop();
        }, this.options.keepalive);
    }
    /**
     * 发送NOOP命令大服务器
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    noop(callback) {
        this.cmd.append({
            cmd: 'NOOP',
            fn: callback
        });
        this.next();
        return this;
    }
    /**
     * 用户登录方法
     * 在回调函数中判断是否有错误和是否需要密码
     * 如需要密码，则在回调函数中返回ture
     * 从而阻止命令队列执行下一条命令
     * 进而执行pass()方法
     * @param  {[type]}   user     [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    user(user, callback) {
        user = user || this.options.user;
        // 假如没有用户
        // 则抛出错误
        if (!user) {
            this.emit('error', this.throw('The user is required'));
            return;
        }
        // 假如用户正在登录
        // 则不执行登录
        if (this.logging) {
            return;
        }
        // 把logging设置为true
        this.logging = true;
        var me = this;
        // 把命令加入到命令队列的头部
        this.cmd.append({
            cmd: `USER ${user}`,
            // 包装回调函数
            fn: function (error, data) {
                if (error) {
                    return;
                }
                // 如果需要密码
                if (data.status === 331) {
                    // 没有提供密码选项
                    // 则抛出错误信心
                    if (!me.options.password) {
                        me.emit('error', me.throw(data));
                    }
                    // 发送密码
                    me.pass();
                    // 执行回调函数
                    callback && callback(error, data);
                    return true;
                }
                // 执行回调函数
                callback && callback(error, data);
            }
        }, true);
        // 执行下一条命令
        // 此时相当于直接执行登录命令
        this.next();
        return this;
    }
    /**
     * 发送用户密码到服务器
     * 以认证用户
     * @param  {[type]}   pass     [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
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
    /**
     * 发送FEAT到服务器
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    feat(callback) {
        this.cmd.append({
            cmd: 'FEAT',
            fn: callback
        });
        this.next();
        return this;
    }
    /**
     * 发送TYPE命令到服务器
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    type(callback) {
        this.cmd.append({
            cmd: 'TYPE I',
            fn: callback
        });
        this.next();
        return this;
    }
    /**
     * 转到指定目录
     * @param  {[type]}   path     [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    cwd(path, callback) {
        this.cmd.append({
            cmd: `CWD ${path}`,
            fn: callback
        });
        this.next();
        return this;
    }
    /**
     * 删除文件
     * @param  {[type]}   path     [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    delete(path, callback) {
        this.cmd.append({
            cmd: `DELE ${path}`,
            fn: callback
        });
        this.next();
        return this;
    }
    /**
     * 删除目录
     * @param  {[type]}   path     [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    rmd(path, callback) {
        this.cmd.append({
            cmd: `RMD ${path}`,
            fn: callback
        });
        return this;
    }
    /**
     * 创建目录
     * @param  {[type]}   path     [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    mkdir(path, callback) {
        this.cmd.append({
            cmd: `MKD ${path}`,
            fn: callback
        });
        this.next();
        return this;
    }
    /**
     * 重命名文件
     * @param  {[type]}   path1    [文件名]
     * @param  {[type]}   path2    [新文件名]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
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
    /**
     * 返回服务器信息或者指定目录信息
     * @param  {[type]}   path     [目录]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    status(path, callback) {
        /**
         * 封装回调函数
         * @param  {[type]}   error [服务器返回的包装后的错误信息]
         * @param  {[type]}   data  [服务器返回的包装后的信息]
         * @return {Function}       [description]
         */
        let fn = function (error, data) {
            let status = data.data.split(/\r\n/g);
            // 移出返回数据前后的无用信息
            status.shift();
            status.pop();
            // 存储返回的信息
            // 如果为目录则存储目录下的文件与文件夹信息
            let _status = [];
            for (let i = 0, length = status.length; i < length; i++) {
                // 获取修改时间和文件名
                var temp = {
                    lastmodify: status[i].match(/[0-1]{0,1}[0-9]-[0-3]{0,1}[0-9]-[0-9][0-9] +[0-1]{0,1}[0-2]:[0-5]{0,1}[0-9](PM|AM)/i)[0],
                    name: status[i].match(/([a-z0-9]|[.]|[-]|[_])+$/i)[0]
                };
                // 去除多余空白
                temp.lastmodify = temp.lastmodify.replace(/\s+/, ' ');
                // 移出前后空白
                status[i] = status[i].replace(/(^\s*)|(\s*$)/, '');
                // 获取文件类型和大小
                if (status[i].toUpperCase().indexOf('<DIR>') !== -1) {
                    temp.type = 'directory';
                    temp.size = 0;
                } else {
                    temp.type = 'file';
                    temp.size = status[i].match(/\d+\s+([a-z0-9]|[.]|[-]|[_])+$/i)[0]
                    temp.size = temp.size.split(/\s+/)[0];
                }
                // 把当前文件加入数组
                _status.push(temp);
            }
            callback && callback(error, _status);
        }
        // 把命令推入到命令队列末尾
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
    // 获取指定目录下的文件列表
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
    /**
     * 在服务器上存储文件
     * 相当于把本地文件上传到服务器
     * @param  {[type]}   path     [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    stor(path, callback) {
        var me = this;
        /**
         * 调用pasv()方法
         * 让服务器开设一个新端口进行传输
         * 并创建一个新的socket以进行通信
         * @param  {[type]} socket  [新创建的一个socket连接]    
         * @param  {[type]} fn:     [回调函数]
         * @return {[type]}         [description]
         */
        this.pasv(function (socket) {
            me.cmd.append({
                cmd: `STOR ${path}`,
                fn: function (error, data) {
                    if (error) {
                        return;
                    }
                    if (data.status === 150 || data.status === 125) {
                        // 判断是否存在当前文件
                        fs.stat(path, function (err, stats) {
                            if (err) {
                                socket.end(path);
                            } else {
                                // 把文件写入到服务器
                                let stream = fs.createReadStream(path);
                                stream.on('end', function () {
                                    // 由于服务器不返回数据
                                    // 所以把状态设置为1
                                    // 并认为返回响应信心
                                    callback(null, {
                                        status: 1,
                                        msg: `${path} has been stored`,
                                        data: null
                                    });
                                });
                                // 当传输出错误时
                                stream.on('error', function (_error) {
                                    callback(_error);
                                });
                                // 把数据写入socke
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
    /**
     * 发送PASV命令到服务器
     * 服务器返回信息后
     * 把信息解析为IP和Port
     * 并创建一个新的socket连接到IP:Port以进行通信
     * @param  {[type]} socket  [新创建的一个socket连接]    
     * @param  {[type]} fn:     [回调函数]
     * @return {[type]}         [description]
     */
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
    /**
     * 创建一个新的socket
     * 同时设置socket的事件和属性
     * 并在回调函数中返回
     * @param  {[type]}   ip       [description]
     * @param  {[type]}   port     [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
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
    /**
     * ftp连接结束事件处理
     * @return {[type]} [description]
     */
    onend() {
        this.socket.destroy();
    }
    /**
     * 错误信息包装函数
     * @param  {[type]} err [description]
     * @return {[type]}     [description]
     */
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
    /**
     * 错误事件处理函数
     * @param  {[type]} error [description]
     * @return {[type]}       [description]
     */
    onerror(error) {
        const msg = error.toString();
        console.error(msg);
    }
}