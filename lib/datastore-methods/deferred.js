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

module.exports = function Deferred(options, method) {
  var deferredProperties = {
    method: method,
    options: options,
    meta: {},
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
    }
  };

  return deferredObj;
};
