/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var checkAdapterCompatibility = require('../check-adapter-compatibility');


/**
 * Get a connection from the specified datastore's manager, run the
 * provided `during` function, and finally release the connection.
 *
 * > This utility is for a datastore (RDI) method.  Before attempting to use this,
 * > the datastore method guarantees that the adapter actually supports all the
 * > necessary pieces.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Dictionary} options
 *         @required {String} datastoreName
 *         @required {Ref} adapter
 *
 *         @required {Function} during
 *                   @param {Ref} db   [The leased database connection.]
 *                   @param {Function} proceed
 *                          @param {Error?} err
 *                          @param {Ref?} resultMaybe
 *         @optional {Dictionary} meta
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Function} done
 *         @param {Error?} err
 *         @param {Ref?} resultMaybe
 *                If set, this is the result sent back from the provided
 *                `during` function.
 */
module.exports = function helpLeaseConnection(options, done){

  // For convenience, grab a reference to the driver & manager from the adapter.
  // (At this point, they should always exist.)
  var driver = options.adapter.datastores[options.datastoreName].driver;
  var manager = options.adapter.datastores[options.datastoreName].manager;

  //  ╔═╗╔═╗╔═╗ ╦ ╦╦╦═╗╔═╗  ┌─┐  ┌┬┐┌┐   ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
  //  ╠═╣║  ║═╬╗║ ║║╠╦╝║╣   ├─┤   ││├┴┐  │  │ │││││││├┤ │   │ ││ ││││
  //  ╩ ╩╚═╝╚═╝╚╚═╝╩╩╚═╚═╝  ┴ ┴  ─┴┘└─┘  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
  //  ┬ ┬┌─┐┬┌┐┌┌─┐  ┌┬┐┬ ┬┌─┐  ┌┬┐┬─┐┬┬  ┬┌─┐┬─┐
  //  │ │└─┐│││││ ┬   │ ├─┤├┤    ││├┬┘│└┐┌┘├┤ ├┬┘
  //  └─┘└─┘┴┘└┘└─┘   ┴ ┴ ┴└─┘  ─┴┘┴└─┴ └┘ └─┘┴└─
  // Acquire a connection from the manager.
  driver.getConnection({
    manager: manager,
    meta: options.meta
  }, function (err, report){
    if (err) { return done(err); }

    // (`report.meta` is ignored...)
    var db = report.connection;

    //  ╦═╗╦ ╦╔╗╔  ┌┬┐┬ ┬┌─┐  \│/┌┬┐┬ ┬┬─┐┬┌┐┌┌─┐\│/  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌
    //  ╠╦╝║ ║║║║   │ ├─┤├┤   ─ ─ │││ │├┬┘│││││ ┬─ ─  ├┤ │ │││││   │ ││ ││││
    //  ╩╚═╚═╝╝╚╝   ┴ ┴ ┴└─┘  /│\─┴┘└─┘┴└─┴┘└┘└─┘/│\  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘
    // Call the provided `during` function.
    (function _makeCallToDuringFn(proceed){

      // Note that, if you try to call the callback more than once in the iteratee,
      // this method logs a warning explaining what's up, ignoring any subsequent calls
      // to the callback that occur after the first one.
      var didDuringFnAlreadyHalt;
      try {
        options.during(db, function (err, resultMaybe) {
          if (err) { return proceed(err); }

          if (didDuringFnAlreadyHalt) {
            console.warn(
              'Warning: The `during` function provided to `.leaseConnection()` triggered its callback \n'+
              'again-- after already triggering it once!  Please carefully check your `during` function\'s \n'+
              'code to figure out why this is happening.  (Ignoring this subsequent invocation...)'
            );
            return;
          }//-•

          didDuringFnAlreadyHalt = true;

          return proceed(undefined, resultMaybe);

        });//</ invoked `during` >
      } catch (e) { return proceed(e); }

    })(function _afterCallingDuringFn(duringErr, resultMaybe){

      //  ╦ ╦╔═╗╔╗╔╔╦╗╦  ╔═╗  ┌─┐┬─┐┬─┐┌─┐┬─┐  ┌─┐┬─┐┌─┐┌┬┐  \│/┌┬┐┬ ┬┬─┐┬┌┐┌┌─┐\│/
      //  ╠═╣╠═╣║║║ ║║║  ║╣   ├┤ ├┬┘├┬┘│ │├┬┘  ├┤ ├┬┘│ ││││  ─ ─ │││ │├┬┘│││││ ┬─ ─
      //  ╩ ╩╩ ╩╝╚╝═╩╝╩═╝╚═╝  └─┘┴└─┴└─└─┘┴└─  └  ┴└─└─┘┴ ┴  /│\─┴┘└─┘┴└─┴┘└┘└─┘/│\
      //   ┬   ┬─┐┌─┐┬  ┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
      //  ┌┼─  ├┬┘├┤ │  ├┤ ├─┤└─┐├┤   │  │ │││││││├┤ │   │ ││ ││││
      //  └┘   ┴└─└─┘┴─┘└─┘┴ ┴└─┘└─┘  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
      if (duringErr) {

        // Since this `duringErr` came from the userland `during` fn, we can't
        // completely trust it.  So check it out, and if it's not one already,
        // convert `duringErr` into Error instance.
        if (!_.isError(duringErr)) {
          if (_.isString(duringErr)) {
            duringErr = new Error(duringErr);
          }
          else {
            duringErr = new Error(util.inspect(duringErr, {depth:5}));
          }
        }//>-

        // Before exiting with this error, release the connection.
        driver.releaseConnection({ connection: db, meta: options.meta }, {
          error: function(secondaryErr) {
            // This is a rare case, but still, if it happens, we make sure to tell
            // the calling code _exactly_ what occurred.
            return done(new Error(
              'There was an error running this `during` function:\n'+
              '``` (1)\n'+
              duringErr.stack +'\n'+
              '```\n'+
              '...AND THEN when attempting to release the db connection, there was a secondary issue:\n'+
              '``` (2)\n'+
              secondaryErr.stack+'\n'+
              '```'
            ));
          },
          success: function(){
            return done(duringErr);
          }
        });//_∏_ </driver.releaseConnection()>
        return;
      }//--•


      //  ┌─┐┌┬┐┬ ┬┌─┐┬─┐┬ ┬┬┌─┐┌─┐  ╦ ╦╔═╗╔╗╔╔╦╗╦  ╔═╗  ┌─┐┬ ┬┌─┐┌─┐┌─┐┌─┐┌─┐
      //  │ │ │ ├─┤├┤ ├┬┘││││└─┐├┤   ╠═╣╠═╣║║║ ║║║  ║╣   └─┐│ ││  │  ├┤ └─┐└─┐
      //  └─┘ ┴ ┴ ┴└─┘┴└─└┴┘┴└─┘└─┘  ╩ ╩╩ ╩╝╚╝═╩╝╩═╝╚═╝  └─┘└─┘└─┘└─┘└─┘└─┘└─┘
      //   ┬   ┬─┐┌─┐┬  ┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
      //  ┌┼─  ├┬┘├┤ │  ├┤ ├─┤└─┐├┤   │  │ │││││││├┤ │   │ ││ ││││
      //  └┘   ┴└─└─┘┴─┘└─┘┴ ┴└─┘└─┘  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
      // IWMIH, then the `during` function ran successfully.
      // Now try to release the connection.
      driver.releaseConnection({ connection: db, meta: options.meta }, {
        error: function(secondaryErr) {
          return done(new Error(
            'The `during` function ran successfully, but there was an issue releasing '+
            'the db connection:\n'+
            '```\n' +
            secondaryErr.stack+'\n'+
            '```'
          ));
        },
        success: function(){
          return done(undefined, resultMaybe);
        }
      });//</driver.releaseConnection()>

    });//</callback from self-calling function that ran the provided `during` fn>
  });//</driver.getConnection()>

};


// To test:
// ```
// sails.getDatastore().leaseConnection(function(db, proceed){ console.log('db connection: '+db); return proceed(undefined, 'fun result'); }).exec(function(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1]);  })
// ```
//
// Or:
// ```
// sails.getDatastore().leaseConnection(function(db, proceed){  User.find().usingConnection(db).exec(proceed); }).exec(function(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1]);  })
// ```

