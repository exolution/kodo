/**
 * Kodo.js
 * Copyright(c) 2015-2015 exolution
 * MIT Licensed
 */
console.time('Kodo Startup! \nelapsed');

/*强迫症是怎样炼成的*/
var Fs = require('fs');
var URL = require('url');
var Config = require('./Config');
var Router = require('./Router');
var Promise = require('./Promise');
var BodyParser = require('body-parser');
var InvokeContext=require('./InvokeContext');
var ReadyStream = require('./ReadyStream');
var Component = require('./Component');

var Service = require('./Service');
var express = require('express');
var Filter = require('./Filter');
var Action = require('./Action');
var Logger = require('./Logger');
var Utils = require('./Utils');
var Path = require('path');

/*尼玛 缺两个 要死了*/


var _requestUUID = 0;
var _kodo;//Kodo 是单例的
function Kodo(config) {
    if(_kodo) {
        return _kodo;
    }
    else {
        if(!(this instanceof Kodo)) {
            return new Kodo();
        }
        this.filterChain = [];//server-level filter chain
        this.config = Config.init(config);
        //Staticizer.init(ActionEx.getAction());
        //use the default filter
        //this.use('$main');
        Filter.init(this.config);
        Action.init(this.config);
        Router.init(this.config);
        Service.init(this.config);
        _kodo = this;
        this.loadComponent(require('./components/core'));
    }
}
Kodo.prototype.start = function(onStart) {

    var application = express();
    var kodo = this;
    this.buildFilterChain();
    application.use(BodyParser.urlencoded({extended : false}));
    // parse application/json
    application.use(BodyParser.json());
    if(typeof onStart == 'number') {
        application.use(function mainMiddleware(request, response, next) {
            Run(kodo, request, response);
        });
        application.listen(onStart);
        console.timeEnd('Kodo Startup! \nelapsed')
    }
    else {
        Utils.executeAsyncFunction(onStart, this, application).then(function() {
            application.use(function mainMiddleware(request, response, next) {
                Run(kodo, request, response);
            });
            application.listen(onStart);
            console.timeEnd('Kodo Startup! \nelapsed')
        });

    }

    return application;
};

function Run(kodo, request, response, next) {
    resolveRequest(request);
    //instantiate the global filter chain
    var filterChain = kodo.filterChain.concat();
    var invokeContext = new InvokeContext(request,response,filterChain);
    request._requestUUID = _requestUUID++;

    Utils.resolveInvokeChain(request, response, invokeContext, filterChain, 0, function(err) {
        console.error('Uncaught Error:\n' + err.stack);
        response.writeHead(500);
        response.write('Uncaught Error\n');
        response.write(err.stack);
        response.end();
        invokeContext = null;
        return false;
    }).then(function() {
        invokeContext.readyStream.setHeader('X-Powered-By', 'Kodo');
        invokeContext.readyStream.response();
        invokeContext = null;
    });
}
Kodo.prototype.use = function(filterName) {
    if(typeof filterName === 'string') {
        var filter = Filter.getFilter(filterName)
    }
    else if(typeof filterName === 'function') {
        filter = Filter.createFilter(filterName);
    }
    else {
        throw new Error('The arguments of Kodo.use must be a string or function');
    }
    //如果use重复的filter以最后一次的位置为准 即需要删除第一次的
    var idx = this.filterChain.indexOf(filter);
    if(idx != -1) {
        this.filterChain.splice(idx, 1);
    }
    this.filterChain.push(filter);
};
var re_trimEnd = /\?$/;
var i = 0;



Kodo.prototype.loadComponent = function(component) {
    new Component(this).loadComponent(component);
};
Kodo.prototype.buildFilterChain=function(){
    this.filterChain=Filter.buildFilterChain();
};
function resolveRequest(request) {
    //trim the trailer single '?'
    var url = request.url.replace(re_trimEnd, '');
    var parsedUrl = URL.parse(url, true);
    // dispose the session url rewrite
    var splits = parsedUrl.pathname.split(';');
    parsedUrl.pathname = splits[0];
    parsedUrl.param = splits.slice(1).join('');
    //detect mobile request
    var ua = request.headers['user-agent'];
    if(/nokia|sony|ericsson|mot|samsung|htc|sgh|lg|sharp|sie-|philips|panasonic|alcatel|lenovo|iphone|ipod|blackberry|meizu|android|netfront|symbian|ucweb|windowsce|palm|operamini|operamobi|openwave|nexusone|cldc|midp|wap|mobile/i.test(ua)) {
        request.isMobile = true;
    }
    request.cookie = parseCookie(request.headers['cookie']);
    request.parsedUrl = parsedUrl;
}
function parseCookie(cookieStr) {
    var cookie = {};
    if(cookieStr) {
        cookieStr.split(';').forEach(function(e) {
            var splits = e.split('=');
            cookie[splits[0].trim()] = splits[1];
        });
    }
    return cookie;
}

var Namespace = {
    name  : null,
    scope : {},
    apply : function(ns) {
        if(this.name) {
            delete global[this.name];
        }
        this.name = ns;
        global[ns] = this.scope;
    }


};
Kodo.setNamespace = function(ns) {
    Namespace.apply(ns);
};
Kodo.bindToNamespace = function(name, target) {
    Object.defineProperty(Namespace.scope, name, {
        get        : function() {
            return target;
        },
        enumerable : false
    });
};
//for IDE High lighter
global.K={
    Action:0,
    Service:0,
    Filter:0,
    Router:0,
    Promise:0,
    Config:0

};

Kodo.setNamespace('K');
Kodo.bindToNamespace('Utils', Utils);
Kodo.bindToNamespace('Promise', Promise);
Kodo.bindToNamespace('Config', Config);
Kodo.bindToNamespace('Service', Service);
Kodo.bindToNamespace('Action', Action);
Kodo.bindToNamespace('Filter',Filter);
Kodo.bindToNamespace('ReadyStream',ReadyStream);
Kodo.bindToNamespace('Router',Router);
Kodo.bindToNamespace('projectPath',  Path.dirname(require.main.filename));

module.exports = Kodo;