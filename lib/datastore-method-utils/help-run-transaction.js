/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var checkAdapterCompatibility = require('../check-adapter-compatibility');


/**
 * Lease a transactional database connection, run the provided `during` function,
 * then either commit the transaction or (in the event of an error) roll it back.
 * Finally, release the connection back to the manager from whence it came.
 *
 * > This utility is for a datastore (RDI) method.  Before attempting to use this,
 * > the datastore method should guarantee that the adapter (via its driver) actually
 * > supports all the necessary pieces.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Dictionary} options
 *         @required {Ref} manager
 *         @required {Ref} adapter
 *         @required {Function} during
 *                   @param {Ref} db   [The leased (transactional) database connection.]
 *                   @param {Function} proceed
 *                          @param {Error?} err
 *                          @param {Ref?} resultMaybe
 *         @optional {Dictionary} meta
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Function} done
 *         @param {Error?} err
 *         @param {Ref?} resultMaybe
 *                If defined, this is the result sent back from the provided
 *                `during` function.
 */
module.exports = function helpRunTransaction(options, done){

  // For convenience, grab a reference to the driver from the adapter.
  // (At this point, it should always exist.)
  var driver = options.adapter.datastores[options.datastoreName].driver;


  helpLeaseConnection({
    manager: options.manager,
    adapter: options.adapter,
    meta: options.meta,
    during: function (db, proceed){

      //  ╔╗ ╔═╗╔═╗╦╔╗╔  ┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
      //  ╠╩╗║╣ ║ ╦║║║║   │ ├┬┘├─┤│││└─┐├─┤│   │ ││ ││││
      //  ╚═╝╚═╝╚═╝╩╝╚╝   ┴ ┴└─┴ ┴┘└┘└─┘┴ ┴└─┘ ┴ ┴└─┘┘└┘
      driver.beginTransaction({
        manager: options.manager,
        meta: options.meta
      }, function (err, report){
        if (err) { return proceed(err); }


        //  ╦═╗╦ ╦╔╗╔  ┌┬┐┬ ┬┌─┐  \│/┌┬┐┬ ┬┬─┐┬┌┐┌┌─┐\│/  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌
        //  ╠╦╝║ ║║║║   │ ├─┤├┤   ─ ─ │││ │├┬┘│││││ ┬─ ─  ├┤ │ │││││   │ ││ ││││
        //  ╩╚═╚═╝╝╚╝   ┴ ┴ ┴└─┘  /│\─┴┘└─┘┴└─┴┘└┘└─┘/│\  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘
        // Invoke a self-calling function that calls the provided `during` function.
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
                  'Warning: The `during` function provided to `.transaction()` triggered its callback \n'+
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
          //   ┬   ╦═╗╔═╗╦  ╦  ╔╗ ╔═╗╔═╗╦╔═
          //  ┌┼─  ╠╦╝║ ║║  ║  ╠╩╗╠═╣║  ╠╩╗
          //  └┘   ╩╚═╚═╝╩═╝╩═╝╚═╝╩ ╩╚═╝╩ ╩
          // If an error occured while running the duringFn, automatically rollback
          // the transaction.
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

            options.driver.rollbackTransaction({ connection: db, meta: options.meta }, {
              error: function(secondaryErr) {
                return proceed(new Error(
                  'First, encountered error:\n'+
                  '```\n'+
                  duringErr.stack +'\n'+
                  '```\n'+
                  '...AND THEN when attempting to roll back the database transaction, there was a secondary error:\n'+
                  '```\n'+
                  secondaryErr.stack+'\n'+
                  '```'
                ));
              },
              success: function (){
                // Otherwise, the rollback was successful-- so proceed with the
                // original error (this will release the connection).
                return proceed(duringErr);
              }
            });//_∏_ </driver.rollbackTransaction()>
            return;
          }//--•


          //  ┌─┐┌┬┐┬ ┬┌─┐┬─┐┬ ┬┬┌─┐┌─┐  ╦ ╦╔═╗╔╗╔╔╦╗╦  ╔═╗  ┌─┐┬ ┬┌─┐┌─┐┌─┐┌─┐┌─┐
          //  │ │ │ ├─┤├┤ ├┬┘││││└─┐├┤   ╠═╣╠═╣║║║ ║║║  ║╣   └─┐│ ││  │  ├┤ └─┐└─┐
          //  └─┘ ┴ ┴ ┴└─┘┴└─└┴┘┴└─┘└─┘  ╩ ╩╩ ╩╝╚╝═╩╝╩═╝╚═╝  └─┘└─┘└─┘└─┘└─┘└─┘└─┘
          //   ┬   ╔═╗╔═╗╔╦╗╔╦╗╦╔╦╗  ┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
          //  ┌┼─  ║  ║ ║║║║║║║║ ║    │ ├┬┘├─┤│││└─┐├─┤│   │ ││ ││││
          //  └┘   ╚═╝╚═╝╩ ╩╩ ╩╩ ╩    ┴ ┴└─┴ ┴┘└┘└─┘┴ ┴└─┘ ┴ ┴└─┘┘└┘
          // IWMIH, then the `during` function ran successfully.
          driver.commitTransaction({ connection: db, meta: options.meta }, {
            error: function(secondaryErr) {
              // Proceed to release the connection, and send back an error.
              // (Since the transaction could not be committed, this effectively failed.)
              return proceed(new Error(
                'The `during` function ran successfully, but there was an issue '+
                'commiting the db transaction:\n'+
                '```\n' +
                secondaryErr.stack+'\n'+
                '```'
              ));
            },
            success: function(){
              // Proceed to release the connection, sending back the result
              // (only relevant if the provided `during` function sent one back).
              return proceed(undefined, resultMaybe);
            }
          });//</callback from driver.commitTransaction()>
        });//</callback from self-calling function that ran the provided `during` fn>
      });//</callback from driver.beginTransaction()>
    }//</argins for helpLeaseConnection()>
  }, function (err, resultMaybe) {
    if (err) { return done(err); }
    return done(undefined, resultMaybe);
  });//</callback from helpLeaseConnection()>

};



// //  ██████╗ ██╗   ██╗███╗   ██╗
// //  ██╔══██╗██║   ██║████╗  ██║
// //  ██████╔╝██║   ██║██╔██╗ ██║
// //  ██╔══██╗██║   ██║██║╚██╗██║
// //  ██║  ██║╚██████╔╝██║ ╚████║
// //  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
// //
// //  ████████╗██████╗  █████╗ ███╗   ██╗███████╗ █████╗  ██████╗████████╗██╗ ██████╗ ███╗   ██╗
// //  ╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔══██╗██╔════╝╚══██╔══╝██║██╔═══██╗████╗  ██║
// //     ██║   ██████╔╝███████║██╔██╗ ██║███████╗███████║██║        ██║   ██║██║   ██║██╔██╗ ██║
// //     ██║   ██╔══██╗██╔══██║██║╚██╗██║╚════██║██╔══██║██║        ██║   ██║██║   ██║██║╚██╗██║
// //     ██║   ██║  ██║██║  ██║██║ ╚████║███████║██║  ██║╚██████╗   ██║   ██║╚██████╔╝██║ ╚████║
// //     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
// //
// // Runs a queries on a transaction if possible and automatically handles error
// // rollbacks and commiting.

// var _ = require('@sailshq/lodash');
// var flaverr = require('flaverr');
// // var Deferred = require('./deferred');


// // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// // TODO: call helpLeaseConnection() utility in order to simplify the impl. below
// // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

// var runTransactionFn = module.exports = function runTransaction(options, cb) {

//   //  ╦  ╦╔═╗╦  ╦╔╦╗╔═╗╔╦╗╔═╗  ┌─┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
//   //  ╚╗╔╝╠═╣║  ║ ║║╠═╣ ║ ║╣   │ │├─┘ │ ││ ││││└─┐
//   //   ╚╝ ╩ ╩╩═╝╩═╩╝╩ ╩ ╩ ╚═╝  └─┘┴   ┴ ┴└─┘┘└┘└─┘
//   if (_.isUndefined(options) || !_.isPlainObject(options)) {
//     throw new Error('Invalid options argument usage. Options must contain datastoreIdentity, driver, manager, config, and duringFn keys.');
//   }

//   if (!_.has(options, 'datastoreIdentity') || !_.isString(options.datastoreIdentity)) {
//     throw new Error('Invalid options argument usage. Missing or invalid datastoreIdentity option.');
//   }

//   if (!_.has(options, 'driver') || !_.isObject(options.driver) || _.isArray(options.driver) || _.isFunction(options.driver)) {
//     throw new Error('Invalid options argument usage. Missing or invalid driver option.');
//   }

//   if (!_.has(options, 'manager') || !_.isPlainObject(options.manager)) {
//     throw new Error('Invalid options argument usage. Missing or invalid manager option.');
//   }

//   if (!_.has(options, 'config') || !_.isPlainObject(options.config)) {
//     throw new Error('Invalid options argument usage. Missing or invalid config option.');
//   }


//   //  ╦ ╦╔═╗╔╗╔╔╦╗╦  ╔═╗  ┌┬┐┌─┐┌─┐┌─┐┬─┐┬─┐┌─┐┌┬┐
//   //  ╠═╣╠═╣║║║ ║║║  ║╣    ││├┤ ├┤ ├┤ ├┬┘├┬┘├┤  ││
//   //  ╩ ╩╩ ╩╝╚╝═╩╝╩═╝╚═╝  ─┴┘└─┘└  └─┘┴└─┴└─└─┘─┴┘
//   //  ┌─┐┬ ┬┌┐┌┌┬┐┌─┐─┐ ┬
//   //  └─┐└┬┘│││ │ ├─┤┌┴┬┘
//   //  └─┘ ┴ ┘└┘ ┴ ┴ ┴┴ └─
//   // If a callback wasn't defined then return a deferred object which
//   // allows for chainable methods.
//   if (!_.isFunction(cb)) {
//     return Deferred(options, runTransactionFn);
//   }

//   // Validate the duringFn after the deferred has been processed
//   if (!_.has(options, 'duringFn') || !_.isFunction(options.duringFn)) {
//     return cb(new Error('Invalid options argument usage. Missing or invalid duringFn option.'));
//   }

//   // If the driver doesn't have a getConnection method it's invalid and can't be
//   // used by this function.
//   if (!_.has(options.driver, 'getConnection')) {
//     return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `getConnection` method and therefore can\'t be used for this.'));
//   }

//   // If the driver doesn't have a beginTransaction method it's invalid and can't be
//   // used by this function.
//   if (!_.has(options.driver, 'beginTransaction')) {
//     return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `beginTransaction` method and therefore can\'t be used for this.'));
//   }

//   // If the driver doesn't have a commitTransaction method it's invalid and can't be
//   // used by this function.
//   if (!_.has(options.driver, 'commitTransaction')) {
//     return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `commitTransaction` method and therefore can\'t be used for this.'));
//   }

//   // If the driver doesn't have a rollbackTransaction method it's invalid and can't be
//   // used by this function.
//   if (!_.has(options.driver, 'rollbackTransaction')) {
//     return cb(new Error('The provided driver for the ' + options.datastoreIdentity + ' datastore is missing a required `rollbackTransaction` method and therefore can\'t be used for this.'));
//   }


//   //  ╔═╗╔═╗╔╦╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
//   //  ║ ╦║╣  ║   │  │ │││││││├┤ │   │ ││ ││││
//   //  ╚═╝╚═╝ ╩   └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
//   options.driver.getConnection({
//     manager: options.manager,
//     meta: options.config
//   }).exec(function afterEnsureConnection(err, getConnectionReport) {
//     // If there were any errors getting the connection, bail out
//     if (err) {
//       // If there wasn't a code on it for some reason, add a bit of flaverr
//       if (!err.code) {
//         return cb(flaverr({ code: 'error' }, err));
//       }

//       // Otherwise continue on and pass the error through
//       return cb(err);
//     }


//     // Grab the connection from the report
//     var dbConnection = getConnectionReport.connection;


//     //  ╔╗ ╔═╗╔═╗╦╔╗╔  ┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
//     //  ╠╩╗║╣ ║ ╦║║║║   │ ├┬┘├─┤│││└─┐├─┤│   │ ││ ││││
//     //  ╚═╝╚═╝╚═╝╩╝╚╝   ┴ ┴└─┴ ┴┘└┘└─┘┴ ┴└─┘ ┴ ┴└─┘┘└┘
//     options.driver.beginTransaction({
//       connection: dbConnection,
//       meta: options.meta
//     }).exec(function(err) {
//       if (err) {
//         // If there was an error try and release the connection it back into the pool.
//         options.driver.releaseConnection({
//           connection: dbConnection,
//           meta: options.meta
//         }).exec(function(releaseError) {
//           // This is a rare case but if it happens, tell the user exactly what happened.
//           if (releaseError) {
//             var verboseDuringError = new Error('There was an error trying to begin the transaction and when the connection was released there was an issue. Here is the original error:\n\n' + err.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + releaseError.stack);
//             var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
//             return cb(enhancedDuringError);
//           }

//           // If there wasn't a code on it for some reason, add a bit of flaverr
//           if (!err.code) {
//             return cb(flaverr({ code: 'error' }, err));
//           }
//           // Otherwise continue on and pass the error through
//           return cb(err);
//         });

//         return;
//       }


//       //  ╦═╗╦ ╦╔╗╔  ┌┬┐┬ ┬┌─┐  ┌┬┐┬ ┬┬─┐┬┌┐┌┌─┐
//       //  ╠╦╝║ ║║║║   │ ├─┤├┤    │││ │├┬┘│││││ ┬
//       //  ╩╚═╚═╝╝╚╝   ┴ ┴ ┴└─┘  ─┴┘└─┘┴└─┴┘└┘└─┘
//       //  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌
//       //  ├┤ │ │││││   │ ││ ││││
//       //  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘
//       // Once the connection has been created, run the user defined duringFn.
//       try {
//         options.duringFn(dbConnection, function duringFnCb(duringErr, duringResults) {

//           //  ╦═╗╔═╗╦  ╦  ╔╗ ╔═╗╔═╗╦╔═  ┬┌─┐  ┌┐┌┌─┐┌─┐┌┬┐┌─┐┌┬┐
//           //  ╠╦╝║ ║║  ║  ╠╩╗╠═╣║  ╠╩╗  │├┤   │││├┤ ├┤  ││├┤  ││
//           //  ╩╚═╚═╝╩═╝╩═╝╚═╝╩ ╩╚═╝╩ ╩  ┴└    ┘└┘└─┘└─┘─┴┘└─┘─┴┘
//           // If an error occured while running the duringFn, automatically rollback
//           // the transaction.
//           if (duringErr) {
//             options.driver.rollbackTransaction({
//               connection: dbConnection,
//               meta: options.meta
//             }).exec(function(err) {
//               // If there was an error try and release the dbConnection back into the pool.
//               if (err) {
//                 options.driver.releaseConnection({
//                   connection: dbConnection,
//                   meta: options.meta
//                 }).exec(function(releaseError) {
//                   // This is a rare case but if it happens, tell the user exactly what happened.
//                   if (releaseError) {
//                     var verboseDuringError = new Error('There was an error trying to rollback the transaction and when the connection was released there was an issue. Here is the original error:\n\n' + err.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + releaseError.stack);
//                     var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
//                     return cb(enhancedDuringError);
//                   }

//                   // If there wasn't a code on it for some reason, add a bit of flaverr
//                   if (!err.code) {
//                     return cb(flaverr({ code: 'error' }, err));
//                   }
//                   // Otherwise continue on and pass the error through
//                   return cb(err);
//                 });

//                 return;
//               }

//               // Otherwise the connection is now closed so return the duringErr
//               return cb(duringErr);
//             });

//             return;
//           }


//           //  ╔═╗╔═╗╔╦╗╔╦╗╦╔╦╗  ┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
//           //  ║  ║ ║║║║║║║║ ║    │ ├┬┘├─┤│││└─┐├─┤│   │ ││ ││││
//           //  ╚═╝╚═╝╩ ╩╩ ╩╩ ╩    ┴ ┴└─┴ ┴┘└┘└─┘┴ ┴└─┘ ┴ ┴└─┘┘└┘
//           options.driver.commitTransaction({
//             connection: dbConnection,
//             meta: options.meta
//           }).exec(function(err) {
//             // If there was an error commiting the transacation, try and release
//             // the connection back into the pool.
//             if (err) {
//               options.driver.releaseConnection({
//                 connection: dbConnection,
//                 meta: options.meta
//               }).exec(function(releaseError) {
//                 // This is a rare case but if it happens, tell the user exactly what happened.
//                 if (releaseError) {
//                   var verboseDuringError = new Error('There was an error commiting the transaction and when the connection was released there was an issue. Here is the original error:\n\n' + err.stack + '\n\nand here is what we got when we tried to close the connection.\n\n' + releaseError.stack);
//                   var enhancedDuringError = flaverr({ code: 'error' }, verboseDuringError);
//                   return cb(enhancedDuringError);
//                 }

//                 // If there wasn't a code on it for some reason, add a bit of flaverr
//                 if (!err.code) {
//                   return cb(flaverr({ code: 'error' }, err));
//                 }
//                 // Otherwise continue on and pass the error through
//                 return cb(err);
//               });

//               return;
//             }


//             //  ╦═╗╔═╗╦  ╔═╗╔═╗╔═╗╔═╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
//             //  ╠╦╝║╣ ║  ║╣ ╠═╣╚═╗║╣   │  │ │││││││├┤ │   │ ││ ││││
//             //  ╩╚═╚═╝╩═╝╚═╝╩ ╩╚═╝╚═╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
//             options.driver.releaseConnection({
//               connection: dbConnection,
//               meta: options.meta
//             }).exec(function(err) {
//               if (err) {
//                 // If there wasn't a code on it for some reason, add a bit of flaverr
//                 if (!err.code) {
//                   return cb(flaverr({ code: 'error' }, err));
//                 }
//                 // Otherwise continue on and pass the error through
//                 return cb(err);
//               }

//               return cb(null, duringResults);
//             }); // </ releaseConnection >
//           }); // </ commitTransaction >
//         }); // </ duringFn >
//       } catch (e) {
//         return cb(e);
//       }

//     }); // </ beginTransaction >
//   }); // </ afterEnsureConnection >
// };
