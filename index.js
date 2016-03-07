/**
 * Module dependencies
 */

var util = require('util');
var async = require('async');
var toInitialize = require('./lib/to-initialize');
var toReload = require('./lib/to-reload');
var toTeardown = require('./lib/to-teardown');



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
  var hook = {


    /**
     * defaults
     *
     * The implicit configuration defaults merged into `sails.config` by this hook.
     *
     * @type {Dictionary}
     */
    defaults: {

      globals: {
        adapters: true,
        models: true
      },

      // Default model properties
      models: {

        // This default connection (i.e. datasource) for the app
        // will be used for each model unless otherwise specified.
        connection: 'localDiskDb'
      },


      // Connections to data sources, web services, and external APIs.
      // Can be attached to models and/or accessed directly.
      connections: {

        // Built-in disk persistence
        // (by default, creates the file: `.tmp/localDiskDb.db`)
        localDiskDb: {
          adapter: 'sails-disk'
        }
      }
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
      if (!hook.models) {
        hook.models = {};
        // Expose a reference to `hook.models` as `sails.models`
        sails.models = hook.models;
      }
      if (!hook.adapters) {
        hook.adapters = {};
        // Expose a reference to `hook.adapters` as `sails.adapters`
        sails.adapters = hook.adapters;
      }

      // Listen for reload events
      sails.on('hook:orm:reload', hook.reload);

      // Listen for lower event, and tear down all of the adapters
      sails.once('lower', hook.teardown);
    },



    /**
     * initialize()
     *
     * Logic to run when this hook loads.
     */
    initialize: toInitialize(hook, sails),



    /**
     * sails.hooks.orm.reload()
     */
    reload: toReload(hook, sails),



    /**
     * sails.hooks.orm.teardown()
     */
    teardown: toTeardown(hook, sails),



  };

  return hook;
};
