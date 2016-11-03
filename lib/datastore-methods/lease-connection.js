//  ██╗     ███████╗ █████╗ ███████╗███████╗
//  ██║     ██╔════╝██╔══██╗██╔════╝██╔════╝
//  ██║     █████╗  ███████║███████╗█████╗
//  ██║     ██╔══╝  ██╔══██║╚════██║██╔══╝
//  ███████╗███████╗██║  ██║███████║███████╗
//  ╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝
//
//   ██████╗ ██████╗ ███╗   ██╗███╗   ██╗███████╗ ██████╗████████╗██╗ ██████╗ ███╗   ██╗
//  ██╔════╝██╔═══██╗████╗  ██║████╗  ██║██╔════╝██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║
//  ██║     ██║   ██║██╔██╗ ██║██╔██╗ ██║█████╗  ██║        ██║   ██║██║   ██║██╔██╗ ██║
//  ██║     ██║   ██║██║╚██╗██║██║╚██╗██║██╔══╝  ██║        ██║   ██║██║   ██║██║╚██╗██║
//  ╚██████╗╚██████╔╝██║ ╚████║██║ ╚████║███████╗╚██████╗   ██║   ██║╚██████╔╝██║ ╚████║
//   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝ ╚═════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
//
// Lease a new connection from the datastore for use in running multiple queries
// on the same connection. After all logic has been run always release the connection
// back into the pool.

var _ = require('lodash');
var flaverr = require('flaverr');
var Deferred = require('./deferred');

var leaseConnectionFn = module.exports = function leaseConnection(options, cb) {

  //  ╦  ╦╔═╗╦  ╦╔╦╗╔═╗╔╦╗╔═╗  ┌─┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
  //  ╚╗╔╝╠═╣║  ║ ║║╠═╣ ║ ║╣   │ │├─┘ │ ││ ││││└─┐
  //   ╚╝ ╩ ╩╩═╝╩═╩╝╩ ╩ ╩ ╚═╝  └─┘┴   ┴ ┴└─┘┘└┘└─┘
  if (_.isUndefined(options) || !_.isPlainObject(options)) {
    throw new Error('Invalid options argument useage. Options must contain datastoreIdentity, driver, manager, config, and duringFn keys.');
  }

  if (!_.has(options, 'datastoreIdentity') || !_.isString(options.datastoreIdentity)) {
    throw new Error('Invalid options argument usage. Missing or invalid datastoreIdentity option.');
  }

  if (!_.has(options, 'driver') || !_.isObject(options.driver) || _.isArray(options.driver) || _.isFunction(options.driver)) {
    throw new Error('Invalid options argument usage. Missing or invalid driver option.');
  }

  if (!_.has(options, 'manager') || !_.isPlainObject(options.manager)) {
    throw new Error('Invalid options argument usage. Missing or invalid manager option.');
  }

  if (!_.has(options, 'config') || !_.isPlainObject(options.config)) {
    throw new Error('Invalid options argument usage. Missing or invalid config option.');
  }


  //  ╦ ╦╔═╗╔╗╔╔╦╗╦  ╔═╗  ┌┬┐┌─┐┌─┐┌─┐┬─┐┬─┐┌─┐┌┬┐
  //  ╠═╣╠═╣║║║ ║║║  ║╣    ││├┤ ├┤ ├┤ ├┬┘├┬┘├┤  ││
  //  ╩ ╩╩ ╩╝╚╝═╩╝╩═╝╚═╝  ─┴┘└─┘└  └─┘┴└─┴└─└─┘─┴┘
  //  ┌─┐┬ ┬┌┐┌┌┬┐┌─┐─┐ ┬
  //  └─┐└┬┘│││ │ ├─┤┌┴┬┘
  //  └─┘ ┴ ┘└┘ ┴ ┴ ┴┴ └─

  // If a callback wasn't defined then return a deferred object which
  // allows for chainable methods.
  if (!_.isFunction(cb)) {
    return Deferred(options, leaseConnectionFn);
  }


  // Validate the duringFn after the deferred has been processed
  if (!_.has(options, 'duringFn') || !_.isFunction(options.duringFn)) {
    return cb(new Error('Invalid options argument usage. Missing or invalid duringFn option.'));
  }


  //  ╦  ╔═╗╔═╗╔═╗╔═╗  ┌─┐  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
  //  ║  ║╣ ╠═╣╚═╗║╣   ├─┤  │  │ │││││││├┤ │   │ ││ ││││
  //  ╩═╝╚═╝╩ ╩╚═╝╚═╝  ┴ ┴  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
  //  ┬ ┬┌─┐┬┌┐┌┌─┐  ┌┬┐┬ ┬┌─┐  ┌┬┐┬─┐┬┬  ┬┌─┐┬─┐
  //  │ │└─┐│││││ ┬   │ ├─┤├┤    ││├┬┘│└┐┌┘├┤ ├┬┘
  //  └─┘└─┘┴┘└┘└─┘   ┴ ┴ ┴└─┘  ─┴┘┴└─┴ └┘ └─┘┴└─

  // If the driver doesn't have a getConnection method it's invalid and can't be
  // used by this function.
  if (!_.has(options.driver, 'getConnection')) {
    return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `getConnection` method and therefore can\'t be used for this.'));
  }

  // Get a connection from the manager
  options.driver.getConnection({
    manager: options.manager,
    meta: options.config
  })
  .exec({
    error: function error(err) {
      var enhancedError = flaverr({ code: 'error' }, err);
      return cb(enhancedError);
    },
    failed: function failed(err) {
      var enhancedError = flaverr({ code: 'failed' }, err);
      return cb(enhancedError);
    },
    success: function success(connection) {

      // Once the connection has been created, run the duringFn and then release
      // the open connection back into the pool.
      options.duringFn(connection.connection, function duringFnCb(duringErr, duringResults) {
        // Always release the connection back into pool regardless of error state.
        options.driver.releaseConnection({
          connection: connection.connection,
          meta: options.config
        })
        .exec({
          error: function error(err) {
            if (duringErr) {
              // This is a rare case but if it happens, tell the user exactly what happened.
              var verboseDuringError = new Error('There was an error running your function and when the connection was released there was an issue. Here is the original error:\n\n' + duringErr.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + err.stack);
              var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
              return cb(enhancedDuringError);
            }

            var enhancedError = flaverr({ code: 'error' }, new Error('There was an issue releasing the connection back into the pool. Here is the error when the connection was released.\n\n' + err.stack));
            return cb(enhancedError);
          },
          badConnection: function badConnection(report) {
            if (duringErr) {
              // This is a rare case but if it happens, tell the user exactly what happened.
              var verboseDuringError = new Error('There was an error running your function and when the connection was released the connection was no longer valid. It could be that the database was stopped or some other issue. Here is the original error:\n\n' + duringErr.stack);
              var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
              return cb(enhancedDuringError);
            }

            var enhancedError = flaverr({ code: 'error' }, new Error('When the connection release was attempted the connection was no longer valid. It could be that the database was stopped or some other issue.'));
            return cb(enhancedError);
          },
          success: function success() {
            // If an error occured in the duringFn return the cb with the error
            if (duringErr) {
              return cb(duringErr);
            }

            // Otherwise the connection is now closed so return any results that
            // may have been send from the during function.
            return cb(null, duringResults);
          }
        });
      });
    }
  });
};
