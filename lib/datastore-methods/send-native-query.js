//  ███████╗███████╗███╗   ██╗██████╗     ███╗   ██╗ █████╗ ████████╗██╗██╗   ██╗███████╗
//  ██╔════╝██╔════╝████╗  ██║██╔══██╗    ████╗  ██║██╔══██╗╚══██╔══╝██║██║   ██║██╔════╝
//  ███████╗█████╗  ██╔██╗ ██║██║  ██║    ██╔██╗ ██║███████║   ██║   ██║██║   ██║█████╗
//  ╚════██║██╔══╝  ██║╚██╗██║██║  ██║    ██║╚██╗██║██╔══██║   ██║   ██║╚██╗ ██╔╝██╔══╝
//  ███████║███████╗██║ ╚████║██████╔╝    ██║ ╚████║██║  ██║   ██║   ██║ ╚████╔╝ ███████╗
//  ╚══════╝╚══════╝╚═╝  ╚═══╝╚═════╝     ╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═══╝  ╚══════╝
//
//   ██████╗ ██╗   ██╗███████╗██████╗ ██╗   ██╗
//  ██╔═══██╗██║   ██║██╔════╝██╔══██╗╚██╗ ██╔╝
//  ██║   ██║██║   ██║█████╗  ██████╔╝ ╚████╔╝
//  ██║▄▄ ██║██║   ██║██╔══╝  ██╔══██╗  ╚██╔╝
//  ╚██████╔╝╚██████╔╝███████╗██║  ██║   ██║
//   ╚══▀▀═╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝
//
// Send a native query to the driver and return the results.

var _ = require('lodash');
var flaverr = require('flaverr');
var Deferred = require('./deferred');

var sendNativeQueryFn = module.exports = function sendNativeQuery(options, cb) {

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
    return Deferred(options, sendNativeQueryFn);
  }


  // If the driver doesn't have a getConnection method it's invalid and can't be
  // used by this function.
  if (!_.has(options.driver, 'getConnection')) {
    return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `getConnection` method and therefore can\'t be used for this.'));
  }

  // If the driver doesn't have a sendNativeQuery method it's invalid and can't be
  // used by this function.
  if (!_.has(options.driver, 'sendNativeQuery')) {
    return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `sendNativeQuery` method and therefore can\'t be used for this.'));
  }

  // If the driver doesn't have a parseNativeQueryError method it's invalid and can't be
  // used by this function.
  if (!_.has(options.driver, 'parseNativeQueryError')) {
    return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `parseNativeQueryError` method and therefore can\'t be used for this.'));
  }

  // Validate the query exists after the deferred has been processed
  if (!_.has(options, 'nativeQuery')) {
    return cb(new Error('Missing or invalid nativeQuery.'));
  }

  // Create a flag to determine if the connection was leased internally or externally
  var leasedExternally = _.has(options, 'dbConnection') && !_.isUndefined(options.dbConnection);


  //  ╔═╗╔╗╔╔═╗╦ ╦╦═╗╔═╗  ┌─┐  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
  //  ║╣ ║║║╚═╗║ ║╠╦╝║╣   ├─┤  │  │ │││││││├┤ │   │ ││ ││││
  //  ╚═╝╝╚╝╚═╝╚═╝╩╚═╚═╝  ┴ ┴  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
  (function ensureConnection(proceed) {

    // Check for a connection being used
    if (leasedExternally) {
      return setImmediate(function() {
        proceed(null, options.dbConnection);
      });
    }

    // Otherwise lease a connection from the manager
    options.driver.getConnection({
      manager: options.manager,
      meta: options.config
    })
    .exec(function(err, report) {
      if (err) {
        // If there wasn't a code on it for some reason, add a bit of flaverr
        if (!err.code) {
          return proceed(flaverr({ code: 'error' }, err));
        }

        // Otherwise continue on and pass the error through
        return proceed(err);
      }

      // Return the active connection
      return proceed(null, report.connection);
    });
  })(function afterEnsureConnection(err, dbConnection) {

    // If there were any errors getting the connection, bail out
    if (err) {
      return cb(err);
    }


    //  ╔═╗╔═╗╔╗╔╔╦╗  ┌┐┌┌─┐┌┬┐┬┬  ┬┌─┐  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
    //  ╚═╗║╣ ║║║ ║║  │││├─┤ │ │└┐┌┘├┤   │─┼┐│ │├┤ ├┬┘└┬┘
    //  ╚═╝╚═╝╝╚╝═╩╝  ┘└┘┴ ┴ ┴ ┴ └┘ └─┘  └─┘└└─┘└─┘┴└─ ┴
    options.driver.sendNativeQuery({
      connection: dbConnection,
      nativeQuery: options.nativeQuery,
      meta: options.meta
    }).exec(function(err, sendNativeQueryReport) {


      //  ╔═╗╔═╗╦═╗╔═╗╔═╗  ┌─┐┬─┐┬─┐┌─┐┬─┐
      //  ╠═╝╠═╣╠╦╝╚═╗║╣   ├┤ ├┬┘├┬┘│ │├┬┘
      //  ╩  ╩ ╩╩╚═╚═╝╚═╝  └─┘┴└─┴└─└─┘┴└─
      // Parse the native query error into a normalized format
      var parsedError;
      if (err) {
        try {
          parsedError = options.driver.parseNativeQueryError({
            nativeQueryError: err
          }).execSync();
        } catch (e) {
          // If for some reason the error can't be parsed, don't exit out. The
          // connection should still be released and the error should still be
          // returned.
          parsedError = e;
          parsedError.footprint = {};
        }

        // If the catch all error was used, return an error instance instead of
        // the footprint.
        var catchAllError = false;

        if (parsedError.footprint.identity === 'catchall') {
          catchAllError = true;
        }
      }


      //  ╦═╗╔═╗╦  ╔═╗╔═╗╔═╗╔═╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
      //  ╠╦╝║╣ ║  ║╣ ╠═╣╚═╗║╣   │  │ │││││││├┤ │   │ ││ ││││
      //  ╩╚═╚═╝╩═╝╚═╝╩ ╩╚═╝╚═╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
      // Regardless of error state if a connection was leased internally it will
      // need to be released back into the pool.
      if (!leasedExternally) {
        options.driver.releaseConnection({
          connection: dbConnection,
          meta: options.meta
        }).exec(function(releaseError) {
          // This is a rare case but if it happens, tell the user exactly what happened.
          if (err && releaseError) {
            var verboseDuringError = new Error('There was an error sending the statement and when the connection was released there was an issue. Here is the original error:\n\n' + parsedError.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + releaseError.stack);
            var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
            return cb(enhancedDuringError);
          }

          // Handle the case where the wasn't an error running the native query but
          // for some reason the connection couldn't be released.
          if (releaseError) {
            var enhancedError = flaverr({ code: 'error' }, new Error('There was an issue releasing the connection back into the pool. Here is the error when the connection was released.\n\n' + releaseError.stack));
            return cb(enhancedError);
          }

          // Handle the case where there was and error running the native query.
          if (err) {
            // If there wasn't a code on it for some reason, add a bit of flaverr
            if (!err.code) {
              return cb(flaverr({ code: 'error' }, parsedError));
            }
            // Otherwise continue on and pass the error through
            return cb(parsedError);
          }

          // Otherwise just return the results of the native query.
          cb(null, sendNativeQueryReport.result);
        });

        return;
      }

      // Otherwise the connection was leased externally so it's up to the leaser
      // to handle closing it. Return the results of the nativeQueryReport or an
      // error message.
      if (err) {
        // If there wasn't a code on it for some reason, add a bit of flaverr
        if (!err.code) {
          return cb(flaverr({ code: 'error' }, parsedError));
        }
        // Otherwise continue on and pass the error through
        return cb(parsedError);
      }

      return cb(null, sendNativeQueryReport.result);

    }); // </ sendNativeQuery >
  }); // </ afterEnsureConnection >
};
