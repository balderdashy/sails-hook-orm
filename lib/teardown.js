/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');


/**
 * teardown()
 *
 * Teardown ORM hook.
 *
 * @required  {Dictionary} hook
 * @required  {SailsApp} sails
 * @optional {Function} done
 */
module.exports = function teardown (hook, sails, done) {
  if (done && !_.isFunction(done)) { throw new Error('Consistency violation: If specified, `done` must be a function.'); }

  // Tear down the ORM.
  try {
    hook._orm.teardown(function(err) {
      if (err && done) { return done(err); }
      else if (err) {
        sails.log.error('Failed to teardown ORM hook.  Details:', err);
        return;
      }
      else if (done) { return done(); }
    });
  } catch (e) { return done(e); }

};
