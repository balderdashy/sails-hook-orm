/**
 * Module dependencies
 */

var assert = require('assert');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var doWithConnection = require('./private/do-with-connection');

/**
 * helpSendNativeQuery()
 *
 * Send a native query to the database and return the results.
 *
 * > This utility is for a datastore (RDI) method.  Before attempting to use this,
 * > the datastore method should guarantee that the adapter (via its driver) actually
 * > supports all the necessary pieces.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Dictionary} options
 *         @required {JSON} nativeQuery
 *         @required {Ref} driver
 *         @either
 *           @or {Ref} manager
 *           @or {Ref} connection
 *         @optional {Array} valuesToEscape
 *         @optional {Dictionary} meta
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Function} done
 *         @param {Error?} err
 *                @property {String?} code
 *                @property {Dictionary?} raw   << present when `code` === "E_QUERY_FAILED"
 *                          @property {Error} error
 *                          @property {Ref} meta
 *         @param {JSON} rawResult
 */
module.exports = function helpSendNativeQuery(options, done){

  assert(_.isString(options.nativeQuery) && options.nativeQuery !== '');
  assert(options.driver);
  assert(options.manager || options.connection);
  assert(!options.meta || options.meta && _.isObject(options.meta));

  // If a pre-leased connection was passed in, proceed with that.
  // Otherwise, lease a new connection.
  doWithConnection({
    driver: options.driver,
    manager: options.manager,      // \____one or the other__
    connection: options.connection,// /¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯
    meta: options.meta,
    during: function (db, proceed){

      //  ╔═╗╔═╗╔╗╔╔╦╗  ┌┐┌┌─┐┌┬┐┬┬  ┬┌─┐  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
      //  ╚═╗║╣ ║║║ ║║  │││├─┤ │ │└┐┌┘├┤   │─┼┐│ │├┤ ├┬┘└┬┘
      //  ╚═╝╚═╝╝╚╝═╩╝  ┘└┘┴ ┴ ┴ ┴ └┘ └─┘  └─┘└└─┘└─┘┴└─ ┴
      options.driver.sendNativeQuery({
        connection: db,
        nativeQuery: options.nativeQuery,
        valuesToEscape: options.valuesToEscape,
        meta: options.meta
      }).switch({
        error: function(err) { return proceed(err); },
        queryFailed: function (failureReport){

          // Sanity check.
          try { assert(_.isError(failureReport.error), 'The `error` property of the failure report from the low-level `sendNativeQuery` driver method should always be an Error instance, but this time, it is not!  (This indicates that there is a bug in this adapter/driver.)'); } catch (e) { return proceed(e); }

          // Parse a "footprint" from the error in the failure report.
          //
          // > More info:
          // > • https://github.com/node-machine/driver-interface/blob/386b5691806164f1d429fac54b84db97a978d601/machines/parse-native-query-error.js
          // > • https://github.com/treelinehq/waterline-query-docs/blob/a0689b6a6536a3c196dff6a9528f2ef72d4f6b7d/docs/errors.md
          var errorParsingReport;
          try {
            errorParsingReport = options.driver.parseNativeQueryError({
              nativeQueryError: failureReport.error
            }).execSync();
          } catch (e) {
            return proceed(new Error(
              'Query failed:\n'+
              '```\n'+
              failureReport.error.stack+'\n'+
              '```\n'+
              '...AND attempting to parse that error resulted in an unexpected secondary error:\n'+
              '```\n'+
              e.stack+'\n'+
              '```'
            ));
          }//</catch>  >-•

          // Provide a higher-level error message, but attach a `code` (E_QUERY_FAILED)
          // as well as the `footprint` we parsed above.  Finally, also attach the raw
          // report from sendNativeQuery() as the `raw` property.
          //
          // > (Note that `errorParsingReport.meta` is ignored)
          return proceed(flaverr({
            code: 'E_QUERY_FAILED',
            footprint: errorParsingReport.footprint,
            raw: failureReport,
          }, new Error(
            'Query failed: '+failureReport.error.message
          )));
        },
        success: function (successfulQueryReport){
          // (`successfulQueryReport.meta` is ignored)
          return proceed(undefined, successfulQueryReport.result);
        }
      });//</ callback from driver.sendNativeQuery() >

    }//</`during` (howto function)>
  }, function afterwards(err, rawResult){// ~∞%°
    if (err) { return done(err); }
    return done(undefined, rawResult);
  });//</ doWithConnection() >

};


// To test:
// ```
// User.getDatastore().sendNativeQuery('SELECT * FROM user').exec(function _afterwards(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1]);  });
// ```

