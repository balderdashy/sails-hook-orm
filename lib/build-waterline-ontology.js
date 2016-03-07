/**
 * Module dependencies
 */

var util = require('util');
var _ = require('lodash');
var Waterline = require('waterline');



/**
 * buildWaterlineOntology()
 *
 * Instantiate a Waterline "collection" for each Sails model,
 * then tell Waterline to initialize the ORM and trigger the
 * callback with that fresh new Waterline ontology.
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
    var freshOntology = new Waterline();

    // Next, iterate through each normalized model definition and register it with Waterline
    // (using the `loadCollection()` method).
    _.each(hook.models, function _loadEachModelDefIntoWaterline(normalizedModelDef, identity) {
      // Create a Waterline "Collection" instance for each model, then register it w/ the ORM.
      sails.log.silly('Registering model `%s` in Waterline (ORM)', identity);
      console.log('Registering model `%s` in Waterline (ORM):', identity, normalizedModelDef);
      freshOntology.loadCollection(Waterline.Collection.extend(normalizedModelDef));
    });

    console.log('ADAPTERS PASSED IN TO WATERLINE:',hook.adapters);

    // Now, tell Waterline to initialize the ORM by calling its `.initialize()` method.
    // This performs tasks like interpretating the physical-layer schema, validating associations,
    // hooking up models to their datastores (fka "connections"), and performing auto-migrations.
    freshOntology.initialize({

      // Pass in the app's known adapters.
      adapters: hook.adapters,

      // We build and pass in a dictionary of all configured datastores (fka connections)
      // which _are actually in use_ (this is to avoid unnecessary work in Waterline).
      // We determine "in-use-dness" by whether a given datastore references any adapters
      // which have already been loaded into memory.
      //
      // This optimization may eventually be supported by Waterline core, in which case
      // this code can be removed.
      //
      // Also note that `forceLoadAdapter` exists as a loophole around this
      // (see the `initialize()` function of this hook for more info)
      connections: (function (){
        var prunedConnections = _.reduce(hook.adapters, function _eachAdapter(memo, unused, adapterIdentity) {
          _.each(sails.config.connections, function _eachDatastoreConfig(datastoreConfig, datastoreIdentity) {
            if (adapterIdentity === datastoreConfig.adapter) {
              memo[datastoreIdentity] = datastoreConfig;
            }
          });
          return memo;
        }, {});
        console.log('CONNECTIONS PASSED IN TO WATERLINE:',prunedConnections);
        return prunedConnections;
      })(),

      // `defaults` are a set of default properties for every model definition.
      // They are defined in `sails.config.models`.
      // Note that the ORM hook takes care of this to some degree, but we also pass them in here.
      // This may change in future versions of Sails.
      defaults: sails.config.models

    }, function _afterInitializingWaterline (err) {
      if (err) { return cb(err); }

      if (util.isFunction(freshOntology.collections) || util.isArray(freshOntology.collections) || !util.isObject(freshOntology.collections)) {
        // Note that prior to March 2016, the second arg of the callback was used instead of relying on the existing `freshOntology` we already
        // have instantiated above (however we've always _sent back_ the existing `freshOntology`-- we just used to use the second arg of the callback
        // for the set of collections)
        return cb(new Error('Consistency violation: Expected `collections` property of ontology instance returned from Waterline to be a dictionary.\nInstead, here is what the ontology instance looks like:\n'+(util.inspect(freshOntology,{depth:null}))));
      }

      // Success
      return cb(undefined, freshOntology);
    });
  }
  // Remember: this try/catch only nabs errors which might be thrown during the first tick.
  catch (e) {
    return cb(e);
  }
};
