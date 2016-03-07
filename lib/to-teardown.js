/**
 * Module dependencies
 */

var util = require('util');
var async = require('async');



/**
 * toTeardown()
 *
 * Get a function that will be exposed on this hook as `.teardown()`.
 *
 * @param  {Dictionary} hook
 * @param  {SailsApp} sails
 * @return {Function}
 */
module.exports = function toTeardown(hook, sails){

  /**
   * teardown()
   *
   * Teardown ORM hook.
   *
   * @optional {Function} done
   */
  return function teardown (done) {
    done = done || function _afterTeardownWithNoCbProvided(err) {
      if (err) {
        sails.log.error('Failed to teardown ORM hook.  Details:',err);
      }
    };

    // If adapters are missing for some reason, then skip this teardown step.
    // This is for backwards compatibility, but should not be relied upon--
    // be careful not to delete or modify things automatically added to `sails`
    // or core hooks (`sails.hooks.*`) in userland hooks without checking hook
    // documentation first!
    if (util.isFunction(hook.adapters) || util.isArray(hook.adapters) || !util.isObject(hook.adapters)) {
      sails.log.warn('Attempting to teardown ORM hook, but `sails.hooks.orm.adapters` is no longer a dictionary.  Skipping...');
      return done();
    }

    async.forEach(Object.keys(hook.adapters), function runTeardownInEachAdapter(adapterIdentity, next) {
      var adapter = hook.adapters[adapterIdentity];
      // If this adapter has no teardown method, just skip it.
      if (!util.isFunction(adapter.teardown)) {
        return next();
      }

      // Otherwise, call `.teardown()` and wait for it to finish first.
      adapter.teardown(null, next);
    }, done);

  };
};
