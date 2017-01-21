/**
 * Module dependencies
 */

var parley = require('parley');


/**
 * [exports description]
 * @param  {[type]} duringFn          [description]
 * @param  {[type]} explicitCbMaybe [description]
 * @return {[type]}                 [description]
 */
module.exports = function fooBar(duringFn, explicitCbMaybe){

  return parley(function _handleExec(done){

    console.log('duringFn:',duringFn);
    return done();

  }, explicitCbMaybe, {

    during: function(_duringFn){
      duringFn = _duringFn;
      return this;
    }

  });//</parley()>

};



// To test:
// ```
// sails.getDatastore().fooBar().exec(function(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1]);  })
// ```
