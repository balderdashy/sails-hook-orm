/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var constructError = require('./construct-error');
var invalidAdapterError = require('../constants/invalid-adapter.error');
var checkAdapterCompatibility = require('./check-adapter-compatibility');



/**
 * validateAdapter()
 *
 * Validate the specified adapter to ensure it is compatible with this version of Sails & Waterline.
 * Note that this modifies the provided adapter inline (unlike the other validate* methods in this hook)
 *
 * @required {Dictionary} originalAdapter
 * @required {Dictionary} adapterIdentity
 * @optional {String}  datastoreIdentity [identity of the datastore this adapter is being loaded because of. Not always relevant, but if it is provided, it improves quality of error messages.]
 *
 * @returns {Dictionary} [adapter]
 * @throws {Error} E_ADAPTER_NOT_COMPATIBLE
 */

module.exports = function validateAdapter (originalAdapter, adapterIdentity, datastoreIdentity) {

  // Check that this adapter is valid.
  if (!_.isObject(originalAdapter)) {
    throw new Error('Invalid adapter: Should be a dictionary.');
  }

  // Check this adapter's compatibility with this version of Sails/Waterline.
  checkAdapterCompatibility(datastoreIdentity, originalAdapter);

  // If adapter provides a `defaults` dictionary, it must be a dictionary.
  if (originalAdapter.defaults) {
    if (_.isFunction(originalAdapter.defaults) || _.isArray(originalAdapter.defaults) || !_.isObject(originalAdapter.defaults)) {
      throw constructError(invalidAdapterError, {
        adapterIdentity: adapterIdentity,
        details: 'Invalid `defaults` property; if provided, `defaults` should be a dictionary.',
        datastoreIdentity: datastoreIdentity || undefined
      });
    }
  }
  // Otherwise, add an empty `defaults` dictionary to avoid having to check again later.
  else {
    originalAdapter.defaults = {};
  }

  // Stick an `identity` property on the adapter.
  originalAdapter.identity = adapterIdentity;


  // Return the original adapter (which has now been normalized).
  return originalAdapter;

};
