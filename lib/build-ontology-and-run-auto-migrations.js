/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var Waterline = require('waterline');
var WaterlineUtils = require('waterline-utils');


/**
 * buildOntologyAndRunAutoMigrations()
 *
 * Instantiate a "live" Waterline model instance for each Sails
 * model definition, then tell Waterline to initialize the ORM
 * and trigger the callback with that fresh new Waterline ontology.
 * Finally, run auto-migrations.
 *
 * @required {Dictionary} hook
 * @required {SailsApp} sails
 * @required {Function}  done
 *           @param {Error?} err
 *           @param {===} freshOntology [a freshly initialized ontology from Waterline]
 */
module.exports = function buildOntologyAndRunAutoMigrations(hook, sails, done) {

  try {

    sails.log.silly('Starting ORM...');

    // object to keep track of each datastore and all its models, etc
    var datastores = {};

    // Next, iterate through each normalized model definition and register it with a datastore specific
    // Waterline instance
    _.each(hook.models, function _loadEachModelDefIntoWaterline(model, identity) {
      var datastore = model.datastore;
      if (!datastores.hasOwnProperty(datastore)) {
        datastores[datastore] = {
          name: datastore,
          models: [],
          orm: Waterline(),
          dsConfig: hook.normalizedDSConfigs[datastore],
          migrate: hook.normalizedDSConfigs[datastore].migrate
        };
      }

      // Create a Waterline "Collection" instance for each model, then register it w/ the ORM.
      sails.log.silly('Registering model `%s` in Waterline for `%s` datastore', identity, datastore);
      datastores[datastore].models.push(model);
      datastores[datastore].orm.registerModel(Waterline.Model.extend(model));
    });

  } catch (e) { return done(e); }


  // Save a private reference to the Waterline `datastores` array.
  hook._datastores = datastores;

  Object.keys(datastores).forEach(createMigration);

  function createMigration(datastoreName) {
    var datastore = datastores[datastoreName];

    // Now, tell Waterline to initialize the ORM by calling its `.initialize()` method.
    // This performs tasks like interpretating the physical-layer schema, validating associations,
    // hooking up models to their datastores (fka "connections"), and performing auto-migrations.
    datastore.orm.initialize({

      // Pass in the app's known adapters.
      adapters: hook.adapters,

      // We build and pass in a dictionary of normalized datastore configurations (fka connections)
      // which _are actually in use_ (this is to avoid unnecessary work in Waterline).
      datastores: { [datastoreName]: datastore.dsConfig },
      // e.g.
      // ```
      // { default: { schema: false, filePath: '.tmp/', adapter: 'sails-disk' } }
      // ```

      // `defaults` are a set of default properties for every model definition.
      // They are defined in `sails.config.models`.
      // Note that the ORM hook takes care of this to some degree, but we also pass them in here.
      // This may change in future versions of Sails.
      defaults: sails.config.models

    }, function _afterInitializingWaterline (err, freshOntology) {
      if (err) { return done(err); }

      if (!_.isObject(freshOntology.collections) || _.isArray(freshOntology.collections) || _.isFunction(freshOntology.collections)) {
        // Note that prior to March 2016, the second arg of the callback was used instead of relying on the existing `freshOntology` we already
        // have instantiated above (however we've always _sent back_ the existing `freshOntology`-- we just used to use the second arg of the callback
        // for the set of collections)
        return done(new Error('Consistency violation: Expected `collections` property of ontology instance returned from Waterline to be a dictionary.\nInstead, here is what the ontology instance looks like:\n'+(util.inspect(freshOntology,{depth:null}))));
      }

      try {

        // Now that `waterline-schema` has validated that all of our associations are valid,
        // loop through each model again to set the correct `columnType` for each singular association.
        _.each(freshOntology.collections, function eachModel(WLModel) {

          // Loop through the normalized model and set a column type for each attribute
          _.each(WLModel.attributes, function eachAttribute(attrDef, attrName) {

            // If this attribute is a plural association, or not an association at all, skip it.
            if (!attrDef.model) { return; }

            // Otherwise, this is a singular association.
            //
            // Find out the column type of the primary key attribute of the associated model
            // so that we can use it as the column type of this singular association.
            // (This is for the purpose of automigrations.)
            var otherModelIdentity = attrDef.model;
            var otherWLModel = hook.models[otherModelIdentity];
            var associatedPKAttrName = otherWLModel.primaryKey;
            var associatedPKAttrDef = otherWLModel.attributes[associatedPKAttrName];
            var derivedColumnType = associatedPKAttrDef.autoMigrations.columnType;

            // Set the column type, mutating our WLModel inline.
            // > Also set the column type within the `schema`
            attrDef.autoMigrations.columnType = derivedColumnType;
            WLModel.schema[attrName].autoMigrations.columnType = derivedColumnType;
            // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
            // FUTURE: remove the necessity for this last step by doing away with
            // `schema` and having everything simply edit the WLModel inline.
            // (^this depends on changes in Waterline core)
            // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

          });//</each attribute>

        });//</each model>

        
      } catch (e) { return done(e); }

      datastore.freshOntology = freshOntology;

      // If we don't have a global `migrate` setting at this point, it's because we don't
      // have any models (so the end user wasn't forced to choose a setting on lift).
      // So we can just skip migrations and return.
      if (!sails.config.models.migrate) {
        return done(undefined, freshOntology);
      }

      // Now that all relevant attributes have `autoMigrations` properties set, go ahead
      // and perform any requested migrations.
    });//</waterline.initialize()>
  }
  console.log('--------------------------------- migrating ------------------------------------')
  var migrations = Object.keys(datastores).map(function(datastoreName) {
    var datastore = datastores[datastoreName];
    var migrate
    if (datastore.migrate) {
      migrate = datastore.migrate
      console.log('Using migrate: ' + datastore.migrate + ' for datastore: ' + datastoreName)
    }
    else {
      migrate = sails.config.models.migrate
      console.log('Using sails.config.models.migrate: ' + migrate + ' for datastore: ' + datastoreName)

    }
    return WaterlineUtils.autoMigrations(migrate, datastore.orm)
  });

  Promise.all(migrations).then(function(response, err) {
    if (err) { return done(err); }
    console.log('--------------------------------- migrated -------------------------------------')
    return done(undefined, datastores);
  })

};
