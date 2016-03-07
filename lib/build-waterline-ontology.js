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

  sails.log.verbose('Starting ORM...');

  // First, instantiate a fresh, empty Waterline ORM instance.
  var freshOntology = new Waterline();

  // Next, iterate through each normalized model definition and register it with Waterline
  // (using the `loadCollection()` method).
  _.each(hook.models, function _loadEachModelDefIntoWaterline(normalizedModelDef, identity) {
    // Create a Waterline "Collection" instance for each model, then register it w/ the ORM.
    sails.log.silly('Registering model `%s` in Waterline (ORM)', identity);
    freshOntology.loadCollection(Waterline.Collection.extend(normalizedModelDef));
  });

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
    connections: _.reduce(hook.adapters, function _eachAdapter(memo, unused, adapterIdentity) {
      _.each(sails.config.connections, function _eachDatastoreConfig(datastoreConfig, datastoreIdentity) {
        if (adapterIdentity === datastoreConfig.adapter) {
          memo[datastoreIdentity] = datastoreConfig;
        }
      });
      return memo;
    }, {}),

    // `defaults` are a set of default properties for every model definition.
    // They are defined in `sails.config.models`.
    // Note that the ORM hook takes care of this to some degree, but we also pass them in here.
    // This may change in future versions of Sails.
    defaults: sails.config.models

  }, function _afterInitializingWaterline (err) {
    if (err) { return cb(err); }

    if (!util.isArray(freshOntology.collections)) {
      // Note that prior to March 2016, the second arg of the callback was used instead of relying on the existing `freshOntology` we already
      // have instantiated above (however we've always _sent back_ the existing `freshOntology`-- we just used to use the second arg of the callback
      // for the set of collections)
      return cb(new Error('Consistency violation: Expected `collections` property of ORM instance returned from Waterline to be an array.'));
    }



    // TODO: move this out
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Now take each of the "collections" returned by Waterline and modify them a bit for Sails.
    _.each(freshOntology.collections, function _eachInstantiatedModel(wlModel, modelIdentity) {

      // Bind context (`this`) for models.
      // (this allows `this` to be used in custom model methods)
      _.bindAll(wlModel);

      // Derive information about this model's associations from its schema
      // and attach/expose the metadata as `SomeModel.associations` (an array)
      wlModel.associations = _.reduce(wlModel.attributes, function _eachAttribute(memo, attrDef, attrName) {
        // Skip non-associations.
        if (!util.isObject(attrDef) || (!attrDef.model && !attrDef.collection)) {
          return memo;
        }

        // Build an informational dictionary describing this association.
        var assocInfo = { alias: attrName };
        if (attrDef.model) {
          assocInfo.type = 'model';
          assocInfo.model = attrDef.model;
        }
        else if (attrDef.collection) {
          assocInfo.type = 'collection';
          assocInfo.collection = attrDef.collection;
          if (attrDef.via) {
            assocInfo.via = attrDef.via;
          }
        }
        memo.push(assocInfo);
        return memo;
      }, []);

      // Set `hook.models.*` reference to our instantiated model.
      // Exposed as `hook.models[modelIdentity]`.
      hook.models[modelIdentity] = wlModel;

      // Create global variable for this model based on its `globalId`.
      // (configurable in `sails.config.globals`)
      if (util.isObject(sails.config.globals) && sails.config.globals.models === true) {
        if (util.isString(hook.models[modelIdentity].globalId)) {
          global[hook.models[modelIdentity].globalId] = wlModel;
        }
        // If there is no `globalId`, fall back to the identity.
        // This is for backwards compatibility-- nowadays, Waterline
        // takes care of this automatically:
        else {
          global[hook.models[modelIdentity].identity] = wlModel;
        }
      }
    });
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Success
    return cb(undefined, freshOntology);
  });
};
