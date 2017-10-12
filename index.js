/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var initialize = require('./lib/initialize');
var reload = require('./lib/reload');



/**
 * ORM hook
 *
 * @param  {SailsApp} sails
 * @return {Dictionary} [hook definition]
 */
module.exports = function (sails) {

  /**
   * Build the hook definition.
   * (this is returned below)
   *
   * @type {Dictionary}
   */
  return {


    /**
     * defaults
     *
     * The implicit configuration defaults merged into `sails.config` by this hook.
     *
     * @type {Dictionary}
     */
    defaults: function() {

      var defaults = {

        globals: {
          adapters: true,
          models: true
        },


        // Default model/adapter definitions to automatically attach
        // to `sails.hooks.orm.adapters` and/or `sails.hooks.orm.models`.
        orm: {

          // By default, relevant warnings are shown when NODE_ENV is "production".
          skipProductionWarnings: false,

          //================================================================
          // Experimental
          // (may change at any time!)
          //================================================================
          moduleDefinitions: {
            models: {},
          }
          //================================================================

        },


        // Default model properties
        models: {

          // This default connection (i.e. datasource) for the app
          // will be used for each model unless otherwise specified.
          datastore: 'default',

          // Make the `id` attribute the default primary key.
          primaryKey: 'id',

          // No implicit default attributes.
          attributes: {}

        }

      };

      // If both `sails.config.connections` and `sails.config.datastores` is set, throw an error.
      if (sails.config.datastores && sails.config.connections) {
        throw new Error(
                        '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                        'Invalid database configuration detected!\n'+
                        'The `sails.config.datastores` setting is a replacement for `sails.config.connections`.\n'+
                        'You can\'t have both!  Please check that your `sails.config.datastores` setting is correct,\n'+
                        'and then remove `sails.config.connections ` entirely.\n'+
                        'For more info, see http://sailsjs.com/docs/upgrading/to-v-1-0/#?changes-to-database-configuration.\n'+
                        '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');
      }

      // If both `sails.config.models.connection` and `sails.config.models.datastore` is set, throw an error.
      if (sails.config.models && sails.config.models.datastore && sails.config.models.connection) {
        throw new Error(
                        '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                        'Invalid database configuration detected!\n'+
                        'The `sails.config.models.datastore` setting is a replacement for `sails.config.models.connection`.\n'+
                        'You can\'t have both!  Please check that your `sails.config.models.datastore` setting is correct,\n'+
                        'and then remove `sails.config.models.connection ` entirely.\n'+
                        'For more info, see http://sailsjs.com/docs/upgrading/to-v-1-0/#?changes-to-database-configuration.\n'+
                        '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');
      }

      // Only supply the `default` datastore adapter if it's not configured manually.
      // This is to prevent two adapter modules from being merged together.
      if (!sails.config.datastores || !sails.config.datastores.default || !sails.config.datastores.default.adapter) {

        defaults.datastores = {

          // Built-in disk persistence
          // (by default, creates the file: `.tmp/default.db`)
          default: {
            adapter: 'sails-disk'
          }

        };
      }

      return defaults;

    },



    /**
     * configure()
     *
     * @type {Function}
     */
    configure: function() {

      // Ensure `hook.models` exists, at least as an empty dictionary, very early
      // in the loading process (i.e. before `initialize()` is called).
      //
      // (This particular timing-- before initialize()-- is for backwards compatibility.
      //  Originally it was so that other hooks could mix in models/adapters. Note that
      //  this behavior may change in a future version of Sails.)
      if (!sails.hooks.orm.models) {
        sails.hooks.orm.models = {};
        // Expose a reference to `hook.models` as `sails.models`
        sails.models = sails.hooks.orm.models;
      }
      if (!sails.hooks.orm.adapters) {
        sails.hooks.orm.adapters = {};
        // Expose a reference to `hook.adapters` as `sails.adapters`
        sails.adapters = sails.hooks.orm.adapters;
      }

      // Look for the `connections` config, and if found, log a deprecation message
      // and move it to `datastores`.
      if (sails.config.connections) {
        sails.log.debug('The `sails.config.connections` setting is deprecated.  Please use `sails.config.datastores` instead.');
        sails.log.debug('For more info, see http://sailsjs.com/documentation/upgrading/to-v-1-0/#?changes-to-database-configuration');
        console.log();
        sails.config.datastores = _.extend(sails.config.datastores, sails.config.connections);
        delete sails.config.connections;
      }

      if (sails.config.models.connection) {
        sails.log.debug('The `sails.config.models.connection` setting is deprecated.  Please use `sails.config.models.datastore` instead.');
        sails.log.debug('For more info, see http://sailsjs.com/documentation/upgrading/to-v-1-0/#?changes-to-database-configuration');
        console.log();
        sails.config.models.datastore = sails.config.models.connection;
        delete sails.config.models.connection;
      }

      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      // FUTURE: move both of the following event bindings out of `configure()`.
      // (These were originally moved into `configure` as a hack to solve timing issues,
      // but `configure` is really supposed to be reserved for setting up configuration.)
      // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

      // Listen for reload events.
      sails.on('hook:orm:reload', sails.hooks.orm.reload);

      // Listen for lower event, and tear down all of the adapters
      sails.once('lower', sails.hooks.orm.teardown);
    },



    /**
     * initialize()
     *
     * Logic to run when this hook loads.
     */
    initialize: function (next) {
      // console.log('>>>>>> sails.hooks.orm.initialize() called.');
      // var _ = require('@sailshq/lodash');
      // console.log(
      //   'Currently there are %d models, %d datastores, and %d adapters:',
      //   _.keys(sails.hooks.orm.models).length,
      //   _.keys(sails.hooks.orm.datastores).length,
      //   _.keys(sails.hooks.orm.adapters).length,
      //   _.keys(sails.hooks.orm.models),
      //   _.keys(sails.hooks.orm.datastores),
      //   _.keys(sails.hooks.orm.adapters)
      // );
      return initialize(sails.hooks.orm, sails, next);
    },



    /**
     * sails.hooks.orm.reload()
     */
    reload: function (next) {
      return reload(sails.hooks.orm, sails, next);
    },


    /**
     * sails.hooks.orm.teardown()
     *
     * Tear down the ORM.
     *
     * @required  {Dictionary} hook
     * @required  {SailsApp} sails
     * @optional  {Function} done
     */
    teardown: function (done) {
      // sails.log.verbose('>>>>>> sails.hooks.orm.teardown() called.');

      // Normalize optional callback.
      if (_.isUndefined(done)) {
        done = function (err){
          if (err) {
            sails.log.error('Could not tear down the ORM hook.  Error details:', err);
            sails.log.verbose('(The error above was logged like this because `sails.hooks.orm.teardown()` encountered an error in a code path where it was invoked without providing a callback.)');
            return;
          }//-•
        };
      }
      else if (!_.isFunction(done)) {
        throw new Error('Consistency violation: If specified, `done` must be a function.');
      }

      // If the ORM hasn't been built yet, then don't worry about tearing it down.
      if (!sails.hooks.orm._orm) {
        return done();
      }//-•

      // Tear down the ORM.
      try {
        sails.hooks.orm._orm.teardown(function (err) {
          if (err) { return done(err); }
          else { return done(); }
        });
      } catch (e) { return done(e); }

    },//</ definition of `sails.hooks.orm.teardown` >


  };
};
