//  ██████╗ ███████╗███████╗███████╗██████╗ ██████╗ ███████╗██████╗
//  ██╔══██╗██╔════╝██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗
//  ██║  ██║█████╗  █████╗  █████╗  ██████╔╝██████╔╝█████╗  ██║  ██║
//  ██║  ██║██╔══╝  ██╔══╝  ██╔══╝  ██╔══██╗██╔══██╗██╔══╝  ██║  ██║
//  ██████╔╝███████╗██║     ███████╗██║  ██║██║  ██║███████╗██████╔╝
//  ╚═════╝ ╚══════╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═════╝
//
// Allow chainable methods to be attached to the datastore methods such as
// `.meta()`, `.during()`, and `.exec()`.

var _ = require('lodash');
var Promise = require('bluebird');

module.exports = function Deferred(options, method) {
  var deferredProperties = {
    method: method,
    options: options,
    meta: {},
    // Used for promises
    _deferred: null
  };

  var deferredObj = {
    // Meta function allows additional metadata to be supplied as a pass through
    // from userland code down to the driver methods.
    meta: function meta(data) {
      deferredProperties.meta = data;
      return deferredObj;
    },

    // Attach a during function
    during: function during(duringFn) {
      deferredProperties.options.duringFn = duringFn;
      return deferredObj;
    },

    // Attach a statement function for the sendStatement method
    statement: function statement(statement) {
      deferredProperties.options.statement = statement;
      return deferredObj;
    },

    // Attach a nativeQuery function for the sendNativeQuery method
    nativeQuery: function statement(nativeQuery) {
      deferredProperties.options.nativeQuery = nativeQuery;
      return deferredObj;
    },

    // Attach a usingConnection function for the sendStatement and sendNativeQuery
    // methods.
    usingConnection: function usingConnection(dbConnection) {
      deferredProperties.options.dbConnection = dbConnection;
      return deferredObj;
    },

    // Executes the datastore method.
    exec: function exec(cb) {
      // If no callback was provided throw an error.
      if (_.isUndefined(cb)) {
        throw new Error('Error: No callback supplied. Please define a callback function when executing a datastore method.');
      }

      var isValidCb = _.isFunction(cb) || (_.isObject(cb) && !_.isArray(cb));
      if (!isValidCb) {
        throw new Error('Error: Sorry, `.exec()` doesn\'t know how to handle a callback like that:\n'+ util.inspect(cb, {depth: null}));
      }

      // Add meta to options
      deferredProperties.options.meta = deferredProperties.meta;

      // Set up arguments + callback
      var args = [deferredProperties.options, cb];
      deferredProperties.method.apply({}, args);
    },

    // Executes the datastore method and returns a promise
    toPromise: function toPromise() {
      if (!deferredProperties._deferred) {
        deferredProperties._deferred = Promise.promisify(deferredObj.exec);
      }
      return deferredProperties._deferred;
    },

    // Support `then` from promises
    then: function then(cb, ec) {
      return deferredObj.toPromise().then(cb, ec);
    },

    // Support `spread` from promises
    spread: function spread(cb) {
      return deferredObj.toPromise().spread(cb);
    },

    // Support `catch` from promises
    catch: function _catch(cb) {
     return deferredObj.toPromise().catch(cb);
    }
  };

  return deferredObj;
};
