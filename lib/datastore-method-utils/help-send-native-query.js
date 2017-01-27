/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var helpLeaseConnection = require('./help-lease-connection');

/**
 * Send a native query to the driver and return the results.
 *
 * > This utility is for a datastore (RDI) method.  Before attempting to use this,
 * > the datastore method should guarantee that the adapter (via its driver) actually
 * > supports all the necessary pieces.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Dictionary} options
 *         @required {Ref} manager
 *         @required {Ref} driver
 *         @required {JSON} nativeQuery
 *         @optional {Dictionary} meta
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Function} done
 *         @param {Error?} err
 *         @param {JSON} rawResult
 */
module.exports = function helpSendNativeQuery(options, done){


  helpLeaseConnection({
    manager: options.manager,
    driver: options.driver,
    meta: options.meta,
    during: function (db, proceed){

      //  ╔═╗╔═╗╔╗╔╔╦╗  ┌┐┌┌─┐┌┬┐┬┬  ┬┌─┐  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
      //  ╚═╗║╣ ║║║ ║║  │││├─┤ │ │└┐┌┘├┤   │─┼┐│ │├┤ ├┬┘└┬┘
      //  ╚═╝╚═╝╝╚╝═╩╝  ┘└┘┴ ┴ ┴ ┴ └┘ └─┘  └─┘└└─┘└─┘┴└─ ┴
      options.driver.sendNativeQuery({
        connection: db,
        nativeQuery: options.nativeQuery,
        meta: options.meta
      }).exec({
        error: function(err) { return proceed(err); },
        queryFailed: function (failureReport){
          // (`failureReport.meta` is ignored)
          return proceed(failureReport.error);
        },
        success: function (successReport){
          return proceed(undefined, successReport.result);
        }
      });//</ callback from driver.sendNativeQuery() >
    }//</argins for helpLeaseConnection()>
  }, function (err, resultMaybe) {
    if (err) { return done(err); }
    return done(undefined, resultMaybe);
  });//</callback from helpLeaseConnection()>

};


// To test:
// ```
// User.getDatastore().sendNativeQuery('SELECT * FROM user').exec(function _afterwards(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1].stack);  });
// ```

