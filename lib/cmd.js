/*!
 * FTP CMD
 * Copyright(c) 2016 程刁
 * MIT Licensed
 */
'use strict';
/**
 * ftp命令队列对象
 * Expose FTP CMD class.
 */
exports = module.exports = class CMD {
    constructor() {
        // 当前命令队列
        this.CMD = new Array();
        // 已执行命令队列
        this.CMDED = new Array();
        this.current = Object.create(null);
    };
    getCurrentCmd() {
        return this.current.cmd;
    };
    getCurrentFn() {
        return this.current.fn;
    };
    // 获取当前正在执行命令
    getCurrent() {
        return this.current;
    };

    // 获取下一个命令
    next() {
        var cmd = this.CMD.shift();
        if (!cmd) {
            return null;
        }
        this.current = cmd;
        this.CMDED.push(cmd);
        return cmd.cmd;
    };
    // 把新命令加入队列
    append(cmd, unshift) {
        if (unshift) {
            if (Array.isArray(cmd)) {
                for (let i = 0, length = cmd.length; i < length; i++) {
                    let _cmd = this.warpCmd(cmd[i]);
                    this.CMD.unshift(_cmd);
                }
            } else {
                let _cmd = this.warpCmd(cmd);
                this.CMD.unshift(_cmd);
            }
        } else {
            if (Array.isArray(cmd)) {
                for (let i = 0, length = cmd.length; i < length; i++) {
                    let _cmd = this.warpCmd(cmd[i]);
                    this.CMD.push(_cmd);
                }
            } else {
                let _cmd = this.warpCmd(cmd);
                this.CMD.push(_cmd);
            }
        }
    };
    // 包装命令
    warpCmd(cmd) {
        if (!cmd) {
            return {
                cmd: null,
                fn: null
            }
        }
        return {
            cmd: cmd.cmd || cmd,
            fn: cmd.fn || null
        }
    };
}