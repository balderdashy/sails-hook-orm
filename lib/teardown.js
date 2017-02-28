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
 * @required  {Function} done
 */
module.exports = function teardown (hook, sails, done) {

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // FUTURE: Probably get rid of this utility (it's only a few lines long, and it's only called in one place)
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // Tear down the ORM.
  try {
    hook._orm.teardown(function(err) {
      if (err) { return done(err); }
      else { return done(); }
    });
  } catch (e) { return done(e); }

};
