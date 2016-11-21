//  ██████╗ ██╗   ██╗███╗   ██╗
//  ██╔══██╗██║   ██║████╗  ██║
//  ██████╔╝██║   ██║██╔██╗ ██║
//  ██╔══██╗██║   ██║██║╚██╗██║
//  ██║  ██║╚██████╔╝██║ ╚████║
//  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
//
//  ████████╗██████╗  █████╗ ███╗   ██╗███████╗ █████╗  ██████╗████████╗██╗ ██████╗ ███╗   ██╗
//  ╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔══██╗██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║
//     ██║   ██████╔╝███████║██╔██╗ ██║███████╗███████║██║        ██║   ██║██║   ██║██╔██╗ ██║
//     ██║   ██╔══██╗██╔══██║██║╚██╗██║╚════██║██╔══██║██║        ██║   ██║██║   ██║██║╚██╗██║
//     ██║   ██║  ██║██║  ██║██║ ╚████║███████║██║  ██║╚██████╗   ██║   ██║╚██████╔╝██║ ╚████║
//     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
//
// Runs a queries on a transaction if possible and automatically handles error
// rollbacks and commiting.

var _ = require('lodash');
var flaverr = require('flaverr');
var Deferred = require('./deferred');

var runTransactionFn = module.exports = function runTransaction(options, cb) {

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
    return Deferred(options, runTransactionFn);
  }

  // Validate the duringFn after the deferred has been processed
  if (!_.has(options, 'duringFn') || !_.isFunction(options.duringFn)) {
    return cb(new Error('Invalid options argument usage. Missing or invalid duringFn option.'));
  }

  // If the driver doesn't have a getConnection method it's invalid and can't be
  // used by this function.
  if (!_.has(options.driver, 'getConnection')) {
    return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `getConnection` method and therefore can\'t be used for this.'));
  }

  // If the driver doesn't have a beginTransaction method it's invalid and can't be
  // used by this function.
  if (!_.has(options.driver, 'beginTransaction')) {
    return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `beginTransaction` method and therefore can\'t be used for this.'));
  }

  // If the driver doesn't have a commitTransaction method it's invalid and can't be
  // used by this function.
  if (!_.has(options.driver, 'commitTransaction')) {
    return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `commitTransaction` method and therefore can\'t be used for this.'));
  }

  // If the driver doesn't have a rollbackTransaction method it's invalid and can't be
  // used by this function.
  if (!_.has(options.driver, 'rollbackTransaction')) {
    return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `rollbackTransaction` method and therefore can\'t be used for this.'));
  }


  //  ╔═╗╔═╗╔╦╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
  //  ║ ╦║╣  ║   │  │ │││││││├┤ │   │ ││ ││││
  //  ╚═╝╚═╝ ╩   └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
  options.driver.getConnection({
    manager: options.manager,
    meta: options.config
  }).exec(function afterEnsureConnection(err, getConnectionReport) {
    // If there were any errors getting the connection, bail out
    if (err) {
      // If there wasn't a code on it for some reason, add a bit of flaverr
      if (!err.code) {
        return cb(flaverr({ code: 'error' }, err));
      }

      // Otherwise continue on and pass the error through
      return cb(err);
    }


    // Grab the connection from the report
    var dbConnection = getConnectionReport.connection;


    //  ╔╗ ╔═╗╔═╗╦╔╗╔  ┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
    //  ╠╩╗║╣ ║ ╦║║║║   │ ├┬┘├─┤│││└─┐├─┤│   │ ││ ││││
    //  ╚═╝╚═╝╚═╝╩╝╚╝   ┴ ┴└─┴ ┴┘└┘└─┘┴ ┴└─┘ ┴ ┴└─┘┘└┘
    options.driver.beginTransaction({
      connection: dbConnection,
      meta: options.meta
    }).exec(function(err) {
      if (err) {
        // If there was an error try and release the connection it back into the pool.
        options.driver.releaseConnection({
          connection: dbConnection,
          meta: options.meta
        }).exec(function(releaseError) {
          // This is a rare case but if it happens, tell the user exactly what happened.
          if (releaseError) {
            var verboseDuringError = new Error('There was an error trying to begin the transaction and when the connection was released there was an issue. Here is the original error:\n\n' + err.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + releaseError.stack);
            var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
            return cb(enhancedDuringError);
          }

          // If there wasn't a code on it for some reason, add a bit of flaverr
          if (!err.code) {
            return cb(flaverr({ code: 'error' }, err));
          }
          // Otherwise continue on and pass the error through
          return cb(err);
        });

        return;
      }


      //  ╦═╗╦ ╦╔╗╔  ┌┬┐┬ ┬┌─┐  ┌┬┐┬ ┬┬─┐┬┌┐┌┌─┐
      //  ╠╦╝║ ║║║║   │ ├─┤├┤    │││ │├┬┘│││││ ┬
      //  ╩╚═╚═╝╝╚╝   ┴ ┴ ┴└─┘  ─┴┘└─┘┴└─┴┘└┘└─┘
      //  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌
      //  ├┤ │ │││││   │ ││ ││││
      //  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘
      // Once the connection has been created, run the user defined duringFn.
      try {
        options.duringFn(dbConnection, function duringFnCb(duringErr, duringResults) {

          //  ╦═╗╔═╗╦  ╦  ╔╗ ╔═╗╔═╗╦╔═  ┬┌─┐  ┌┐┌┌─┐┌─┐┌┬┐┌─┐┌┬┐
          //  ╠╦╝║ ║║  ║  ╠╩╗╠═╣║  ╠╩╗  │├┤   │││├┤ ├┤  ││├┤  ││
          //  ╩╚═╚═╝╩═╝╩═╝╚═╝╩ ╩╚═╝╩ ╩  ┴└    ┘└┘└─┘└─┘─┴┘└─┘─┴┘
          // If an error occured while running the duringFn, automatically rollback
          // the transaction.
          if (duringErr) {
            options.driver.rollbackTransaction({
              connection: dbConnection,
              meta: options.meta
            }).exec(function(err) {
              // If there was an error try and release the dbConnection back into the pool.
              if (err) {
                options.driver.releaseConnection({
                  connection: dbConnection,
                  meta: options.meta
                }).exec(function(releaseError) {
                  // This is a rare case but if it happens, tell the user exactly what happened.
                  if (releaseError) {
                    var verboseDuringError = new Error('There was an error trying to rollback the transaction and when the connection was released there was an issue. Here is the original error:\n\n' + err.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + releaseError.stack);
                    var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
                    return cb(enhancedDuringError);
                  }

                  // If there wasn't a code on it for some reason, add a bit of flaverr
                  if (!err.code) {
                    return cb(flaverr({ code: 'error' }, err));
                  }
                  // Otherwise continue on and pass the error through
                  return cb(err);
                });

                return;
              }

              // Otherwise the connection is now closed so return the duringErr
              return cb(duringErr);
            });

            return;
          }


          //  ╔═╗╔═╗╔╦╗╔╦╗╦╔╦╗  ┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
          //  ║  ║ ║║║║║║║║ ║    │ ├┬┘├─┤│││└─┐├─┤│   │ ││ ││││
          //  ╚═╝╚═╝╩ ╩╩ ╩╩ ╩    ┴ ┴└─┴ ┴┘└┘└─┘┴ ┴└─┘ ┴ ┴└─┘┘└┘
          options.driver.commitTransaction({
            connection: dbConnection,
            meta: options.meta
          }).exec(function(err) {
            // If there was an error commiting the transacation, try and release
            // the connection back into the pool.
            if (err) {
              options.driver.releaseConnection({
                connection: dbConnection,
                meta: options.meta
              }).exec(function(releaseError) {
                // This is a rare case but if it happens, tell the user exactly what happened.
                if (releaseError) {
                  var verboseDuringError = new Error('There was an error commiting the transaction and when the connection was released there was an issue. Here is the original error:\n\n' + err.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + releaseError.stack);
                  var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
                  return cb(enhancedDuringError);
                }

                // If there wasn't a code on it for some reason, add a bit of flaverr
                if (!err.code) {
                  return cb(flaverr({ code: 'error' }, err));
                }
                // Otherwise continue on and pass the error through
                return cb(err);
              });

              return;
            }


            //  ╦═╗╔═╗╦  ╔═╗╔═╗╔═╗╔═╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
            //  ╠╦╝║╣ ║  ║╣ ╠═╣╚═╗║╣   │  │ │││││││├┤ │   │ ││ ││││
            //  ╩╚═╚═╝╩═╝╚═╝╩ ╩╚═╝╚═╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
            options.driver.releaseConnection({
              connection: dbConnection,
              meta: options.meta
            }).exec(function(err) {
              if (err) {
                // If there wasn't a code on it for some reason, add a bit of flaverr
                if (!err.code) {
                  return cb(flaverr({ code: 'error' }, err));
                }
                // Otherwise continue on and pass the error through
                return cb(err);
              }

              return cb(null, duringResults);
            }); // </ releaseConnection >
          }); // </ commitTransaction >
        }); // </ duringFn >
      } catch (e) {
        return cb(e);
      }

    }); // </ beginTransaction >
  }); // </ afterEnsureConnection >
};
