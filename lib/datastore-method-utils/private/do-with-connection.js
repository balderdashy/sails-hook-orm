/**
 * Module dependencies
 */

var assert = require('assert');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var STRIP_COMMENTS_RX = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*=[^,\)]*(('(?:\\'|[^'\r\n])*')|("(?:\\"|[^"\r\n])*"))|(\s*=[^,\)]*))/mg;


/**
 * doWithConnection()
 *
 * Run the provided `during` function, passing it the provided connection.
 * Or if no connection was provided, get one from the manager (and then
 * release it afterwards automatically.)
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Dictionary} options
 *         @required {Ref} driver
 *         @required
 *           @either {Ref} manager
 *           @or {Ref} connection
 *
 *         @required {Function} during
 *                   @param {Ref} db   [The database connection.]
 *                   @param {Function} proceed
 *                          @param {Error?} err
 *                          @param {Ref?} resultMaybe
 *
 *         @optional {Dictionary} meta
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Function} done
 *         @param {Error?} err
 *         @param {Ref?} resultMaybe
 *                If set, this is the result sent back from the provided
 *                `during` function.
 */
module.exports = function doWithConnection(options, done){

  assert(options.driver);
  assert(options.manager || options.connection);
  assert(_.isFunction(options.during));
  assert(!options.meta || options.meta && _.isObject(options.meta));

  //  ╔═╗╔═╗╔═╗ ╦ ╦╦╦═╗╔═╗  ┌─┐  ┌┬┐┌┐   ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
  //  ╠═╣║  ║═╬╗║ ║║╠╦╝║╣   ├─┤   ││├┴┐  │  │ │││││││├┤ │   │ ││ ││││
  //  ╩ ╩╚═╝╚═╝╚╚═╝╩╩╚═╚═╝  ┴ ┴  ─┴┘└─┘  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
  //  ┬ ┬┌─┐┬┌┐┌┌─┐  ┌┬┐┬ ┬┌─┐  ┌┬┐┬─┐┬┬  ┬┌─┐┬─┐
  //  │ │└─┐│││││ ┬   │ ├─┤├┤    ││├┬┘│└┐┌┘├┤ ├┬┘
  //  └─┘└─┘┴┘└┘└─┘   ┴ ┴ ┴└─┘  ─┴┘┴└─┴ └┘ └─┘┴└─
  // If a pre-leased connection was passed in, proceed with that.
  // Otherwise, use the driver to acquire a new connection from
  // the manager.
  (function _ensureConnection(proceed){

    if (options.connection) {
      return proceed(undefined, options.connection);
    }//-•

    options.driver.getConnection({
      manager: options.manager,
      meta: options.meta
    }, function (err, report){
      if (err) { return proceed(err); }
      // (`report.meta` is ignored...)
      //
      return proceed(undefined, report.connection);

    });

  })(function (err, db){
    if (err) { return done(err); }

    //  ╦═╗╦ ╦╔╗╔  ┌┬┐┬ ┬┌─┐  \│/┌┬┐┬ ┬┬─┐┬┌┐┌┌─┐\│/  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌
    //  ╠╦╝║ ║║║║   │ ├─┤├┤   ─ ─ │││ │├┬┘│││││ ┬─ ─  ├┤ │ │││││   │ ││ ││││
    //  ╩╚═╚═╝╝╚╝   ┴ ┴ ┴└─┘  /│\─┴┘└─┘┴└─┴┘└┘└─┘/│\  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘
    // Call the provided `during` function.
    (function _makeCallToDuringFn(proceed){

      // Check if the iteratee declares a callback parameter
      var seemsToExpectCallback = (function(){
        var fnStr = options.during.toString().replace(STRIP_COMMENTS_RX, '');
        var parametersAsString = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')'));
        return !! parametersAsString.match(/\,\s*([^,\{\}\[\]\s]+)\s*$/);
      })();//†

      // Note that, if you try to call the callback more than once in the iteratee,
      // this method logs a warning explaining what's up, ignoring any subsequent calls
      // to the callback that occur after the first one.
      var didDuringFnAlreadyHalt;
      try {
        var promiseOrResultMaybe = options.during(db, function (err, resultMaybe) {
          if (!seemsToExpectCallback) { return proceed(new Error('Unexpected attempt to invoke callback: the provided "during" function does not appear to expect a callback parameter.  Please either explicitly list the callback parameter among the arguments or change this code to no longer use a callback.')); }//•
          if (err) { return proceed(err); }

          if (didDuringFnAlreadyHalt) {
            console.warn(
              'Warning: The provided `during` function triggered its callback again-- after\n'+
              'already triggering it once!  Please carefully check your `during` function\'s \n'+
              'code to figure out why this is happening.  (Ignoring this subsequent invocation...)'
            );
            return;
          }//-•

          didDuringFnAlreadyHalt = true;

          return proceed(undefined, resultMaybe);

        });//_∏_  </ invoked `during` >

        // Take care of unhandled promise rejections from `await` (if appropriate)
        if (options.during.constructor.name === 'AsyncFunction') {
          if (!seemsToExpectCallback) {
            promiseOrResultMaybe = promiseOrResultMaybe.then(function(resultMaybe){
              didDuringFnAlreadyHalt = true;
              proceed(undefined, resultMaybe);
            });//_∏_
          }//ﬁ
          promiseOrResultMaybe.catch(function(e){ proceed(e); });//_∏_
        } else {
          if (!seemsToExpectCallback) {
            didDuringFnAlreadyHalt = true;
            return proceed(undefined, promiseOrResultMaybe);
          }
        }
      } catch (e) { return proceed(e); }

    })(function (duringErr, resultMaybe){

      //  ╦ ╦╔═╗╔╗╔╔╦╗╦  ╔═╗  ┌─┐┬─┐┬─┐┌─┐┬─┐  ┌─┐┬─┐┌─┐┌┬┐  \│/┌┬┐┬ ┬┬─┐┬┌┐┌┌─┐\│/
      //  ╠═╣╠═╣║║║ ║║║  ║╣   ├┤ ├┬┘├┬┘│ │├┬┘  ├┤ ├┬┘│ ││││  ─ ─ │││ │├┬┘│││││ ┬─ ─
      //  ╩ ╩╩ ╩╝╚╝═╩╝╩═╝╚═╝  └─┘┴└─┴└─└─┘┴└─  └  ┴└─└─┘┴ ┴  /│\─┴┘└─┘┴└─┴┘└┘└─┘/│\
      //   ┬   ┬─┐┌─┐┬  ┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
      //  ┌┼─  ├┬┘├┤ │  ├┤ ├─┤└─┐├┤   │  │ │││││││├┤ │   │ ││ ││││
      //  └┘   ┴└─└─┘┴─┘└─┘┴ ┴└─┘└─┘  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
      if (duringErr) {

        // Before exiting with this `during` error, check to see if we acquired
        // our own ad hoc connection earlier.  If not, then go ahead and just
        // send back the `during` error.  But otherwise if so, then release our
        // ad hoc connection first before calling the `done` callback.
        if (options.connection) {
          return done(duringErr);
        }//-•

        options.driver.releaseConnection({ connection: db, meta: options.meta }, function(secondaryErr){
          if (secondaryErr) {
            // This is a rare case, but still, if it happens, we make sure to tell
            // the calling code _exactly_ what occurred.
            return done(flaverr({
              raw: duringErr
            }, new Error(
              'The code using this db connection encountered an error:\n'+
              '``` (1)\n'+
              duringErr.message +'\n'+
              '```\n'+
              '...AND THEN when attempting to automatically release the db connection\n'+
              '(since it was leased ad hoc), there was a secondary issue:\n'+
              '``` (2)\n'+
              secondaryErr.stack+'\n'+
              '```'
            )));
          }//•

          return done(duringErr);
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

      // Before exiting, check to see if we acquired our own ad hoc connection earlier.
      // If not, then go ahead and just send back the result from `during`.
      if (options.connection) {
        return done(undefined, resultMaybe);
      }//-•

      // But otherwise, we must have made an ad hoc connection earlier.
      // So before calling the `done` callback, try to release it.
      options.driver.releaseConnection({ connection: db, meta: options.meta }, function(secondaryErr) {
        if (secondaryErr) {
          return done(new Error(
            'The code in the provided `during` function ran successfully with this\n'+
            'db connection, but afterwards, when attempting to automatically release\n'+
            'the connection (since it was leased ad hoc), there was an error:\n'+
            '```\n' +
            secondaryErr.stack+'\n'+
            '```'
          ));
        }//•

        return done(undefined, resultMaybe);
      });//</driver.releaseConnection()>

    });//</ _makeCallToDuringFn (self-invoking function) >
  });//</ _ensureConnection (self-invoking function)>
};
