/**
 * Module dependencies
 */

var parley = require('parley');


module.exports = function (adapter){

  /**
   * leaseConnection()
   *
   * Lease a new connection from the datastore for use in running multiple queries
   * on the same connection (i.e. so that the logic provided in `during` can reuse
   * the db connection).  When finished, or if a fatal error occurs, `during` should
   * call its callback, at which time this will take care of releasing the db connection
   * back to the manager (i.e. pool).
   *
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function} duringFn
   * @param  {Function?} explicitCb
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  return function leaseConnection(duringFn, explicitCb){

    var options = {
      duringFn: duringFn,
      meta: undefined,
      dbConnection: undefined,
    };

    return parley(function _handleExec(done){

      console.log('duringFn:',options.duringFn);
      // TODO
      return done();

    }, explicitCb, {

      during: function (_duringFn){
        options.duringFn = _duringFn;
        return this;
      },

      meta: function(_meta){
        options.meta = _meta;
        return this;
      },

      usingConnection: function(_dbConnection){
        options.dbConnection = _dbConnection;
        return this;
      },

    });//</parley()>

  };
};

// To test:
// ```
// sails.getDatastore().leaseConnection().exec(function(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1]);  })
// ```




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

var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var Deferred = require('./deferred');

var leaseConnectionFn = module.exports = function leaseConnection(options, cb) {

  //  ╦  ╦╔═╗╦  ╦╔╦╗╔═╗╔╦╗╔═╗  ┌─┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
  //  ╚╗╔╝╠═╣║  ║ ║║╠═╣ ║ ║╣   │ │├─┘ │ ││ ││││└─┐
  //   ╚╝ ╩ ╩╩═╝╩═╩╝╩ ╩ ╩ ╚═╝  └─┘┴   ┴ ┴└─┘┘└┘└─┘
  if (_.isUndefined(options) || !_.isPlainObject(options)) {
    throw new Error('Invalid options argument usage. Options must contain datastoreIdentity, driver, manager, config, and duringFn keys.');
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
    meta: options.meta
  })
  .exec(function(err, report) {
    // If there was an error attempt to negotiate it
    if (err) {
      if (!err.code) {
        return cb(err);
      }

      // Enhance with a little flaverr
      return cb(flaverr({ code: err.code }, err));
    }


    //  ╦═╗╦ ╦╔╗╔  ┌┬┐┬ ┬┌─┐  ┌┬┐┬ ┬┬─┐┬┌┐┌┌─┐
    //  ╠╦╝║ ║║║║   │ ├─┤├┤    │││ │├┬┘│││││ ┬
    //  ╩╚═╚═╝╝╚╝   ┴ ┴ ┴└─┘  ─┴┘└─┘┴└─┴┘└┘└─┘
    //  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌
    //  ├┤ │ │││││   │ ││ ││││
    //  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘
    // Once the connection has been created, run the duringFn and then release
    // the open connection back into the pool.
    try {
      options.duringFn(report.connection, function duringFnCb(duringErr, duringResults) {

        //  ╦═╗╔═╗╦  ╔═╗╔═╗╔═╗╔═╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
        //  ╠╦╝║╣ ║  ║╣ ╠═╣╚═╗║╣   │  │ │││││││├┤ │   │ ││ ││││
        //  ╩╚═╚═╝╩═╝╚═╝╩ ╩╚═╝╚═╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
        // Always release the connection back into pool regardless of error state.
        options.driver.releaseConnection({
          connection: report.connection,
          meta: options.config
        })
        .exec(function(err) {
          // This is a rare case but if it happens, tell the user exactly what happened.
          if (err) {

            // If there was also an error runing the during function try and give some
            // indication of what happened.
            if (duringErr) {
              var verboseDuringError = new Error('There was an error running your function and when the connection was released there was an issue. Here is the original error:\n\n' + duringErr.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + err.stack);

              // If there was a code associated with the during error, return it
              if (duringErr.code) {
                var enhancedDuringError = flaverr({ code: err.code }, verboseDuringError);
                return cb(enhancedDuringError);
              }

              // Otherwise just return the verbose error
              return cb(verboseDuringError);
            }

            // Otherwise just return a somewhat nice error message
            return cb(new Error('There was an issue releasing the connection back into the pool. Here is the error when the connection was released.\n\n' + err.stack));
          }

          // Otherwise the connection is now closed so return any results that
          // may have been send from the during function.
          return cb(null, duringResults);
        }); // </ releaseConnection >
      }); // </ duringFn >
    } catch (e) {
      return cb(e);
    }
  }); // </ getConnection >
};
