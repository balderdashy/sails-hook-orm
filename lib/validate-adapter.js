/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var constructError = require('./construct-error');
var invalidAdapterError = require('../constants/invalid-adapter.error');


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

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // FUTURE: Maybe fully-validate ALL adapters loaded into this Sails app-- not just the ones
  // that are actually being referenced by datastores.  There are pros and cons that would
  // need to be considered here.  More background here: https://github.com/balderdashy/sails-hook-orm/commit/c32c097efaa20fbddcdc522b6a072d4d2da615ca#commitcomment-21082632
  //
  // For example, that would mean bringing in additional checks like these:
  // ```
  // // Check this adapter's compatibility with this version of Sails/Waterline.
  // checkAdapterCompatibility(datastoreIdentity, originalAdapter);
  // ```
  // (^^Just remember that our `datastoreIdentity` argument is currently optional, so there'd
  // need to be significant changes!  Also, this would be a breaking change.)
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

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
