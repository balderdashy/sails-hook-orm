/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');

/**
 * setAssociationColumnTypes()
 *
 * Set `autoMigrations.columnType` properties on models.
 *
 * @required {Dictionary} normalizedModelDef
 * @required {String} modelIdentity
 * @required {Dictionary} hook
 */

module.exports = function normalizeColumnTypes (normalizedModelDef, modelIdentity, hook) {

  // Loop through the normalized model and set a column type for each attribute
  _.each(normalizedModelDef.attributes, function setAttributeColumnType (val, attributeName) {

    // If this is a plural association, or not an association at all, skip it.
    if (val.collection || val.type) { return; }

    // If this is a singular association, find out the column type of the primary key attribute
    // of the associated model, and use that.
    if (val.model) {
      var associatedPrimaryKey = hook.models[val.model].primaryKey;
      normalizedModelDef.schema[attributeName].autoMigrations.columnType = val.autoMigrations.columnType = hook.models[val.model].attributes[associatedPrimaryKey].autoMigrations.columnType;
    }

  });

};
