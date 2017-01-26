/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var Waterline = require('waterline');
var WaterlineUtils = require('waterline-utils');
var setAssociationColumnTypes = require('./set-association-column-types');


/**
 * buildWaterlineOntology()
 *
 * Instantiate a "live" Waterline model instance for each Sails
 * model definition, then tell Waterline to initialize the ORM
 * and trigger the callback with that fresh new Waterline ontology.
 *
 * @required {Dictionary} hook
 * @required {SailsApp} sails
 * @required {Function}  cb
 *           @param {Error} err
 *           @param {===} freshOntology [a freshly initialized ontology from Waterline]
 */
module.exports = function buildWaterlineOntology(hook, sails, cb) {

  try {

    sails.log.verbose('Starting ORM...');

    // First, instantiate a fresh, empty Waterline ORM instance.
    var ORM = Waterline();

    // Next, iterate through each normalized model definition and register it with Waterline
    // (using the `loadCollection()` method).
    _.each(hook.models, function _loadEachModelDefIntoWaterline(normalizedModelDef, identity) {
      // Create a Waterline "Collection" instance for each model, then register it w/ the ORM.
      sails.log.silly('Registering model `%s` in Waterline (ORM)', identity);
      ORM.registerModel(Waterline.Collection.extend(normalizedModelDef));
    });


    // Now, tell Waterline to initialize the ORM by calling its `.initialize()` method.
    // This performs tasks like interpretating the physical-layer schema, validating associations,
    // hooking up models to their datastores (fka "connections"), and performing auto-migrations.
    ORM.initialize({

      // Pass in the app's known adapters.
      adapters: hook.adapters,


      // We build and pass in a dictionary of normalized datastore configurations (fka connections)
      // which _are actually in use_ (this is to avoid unnecessary work in Waterline).
      datastores: hook.normalizedDSConfigs,
      // e.g.
      // ```
      // { default: { schema: false, filePath: '.tmp/', adapter: 'sails-disk' } }
      // ```


      // ORIGINAL VERSION:
      //
      // example output:
      // ```
      // >>>>>> sails.hooks.orm.initialize() called.
      // BUILDING ONTOLOGY USING DATASTORES: { default: { adapter: 'sails-disk' } }
      // ```
      //
      // code:
      // ```
      // connections: (function (){
      //   var connectionsInUse = _.reduce(hook.adapters, function (memo, adapter, adapterKey) {
      //     _.each(sails.config.connections, function(connection, connectionKey) {
      //       if (adapterKey === connection.adapter) {
      //         memo[connectionKey] = connection;
      //       }
      //     });
      //     return memo;
      //   }, {});
      //   console.log('BUILDING ONTOLOGY USING DATASTORES:',connectionsInUse);
      //   return connectionsInUse;
      // })(),
      // ```



      // `defaults` are a set of default properties for every model definition.
      // They are defined in `sails.config.models`.
      // Note that the ORM hook takes care of this to some degree, but we also pass them in here.
      // This may change in future versions of Sails.
      defaults: sails.config.models

    }, function _afterInitializingWaterline (err, freshOntology) {
      if (err) { return cb(err); }

      if (_.isFunction(freshOntology.collections) || _.isArray(freshOntology.collections) || !_.isObject(freshOntology.collections)) {
        // Note that prior to March 2016, the second arg of the callback was used instead of relying on the existing `freshOntology` we already
        // have instantiated above (however we've always _sent back_ the existing `freshOntology`-- we just used to use the second arg of the callback
        // for the set of collections)
        return cb(new Error('Consistency violation: Expected `collections` property of ontology instance returned from Waterline to be a dictionary.\nInstead, here is what the ontology instance looks like:\n'+(util.inspect(freshOntology,{depth:null}))));
      }
      // Now that `waterline-schema` has validated that all of our associations are valid,
      // loop through each model again to set the correct `columnType` for each singular association.
      _.each(freshOntology.collections, function(collection, collectionIdentity) {
        setAssociationColumnTypes(collection, collectionIdentity, hook, sails);
      });

      // If we don't have a `migrate` setting at this point, it's because we don't have any models
      // (so the end user wasn't forced to choose a setting on lift).
      // So we can just skip migrations and return.
      if (!sails.config.models.migrate) {
        return cb(undefined, freshOntology);
      }

      // Now that all relevant attributes have `autoMigrations` properties set, go ahead
      // and perform any requested migrations.
      WaterlineUtils.autoMigrations(sails.config.models.migrate, freshOntology, function(err) {
        if (err) {
          return cb(util.inspect(err, {depth: null}));
        }
        // Success
        return cb(undefined, freshOntology);
      });

    });
  }
  // Remember: this try/catch only nabs errors which might be thrown during the first tick.
  catch (e) {
    return cb(e);
  }
};
