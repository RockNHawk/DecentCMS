// DecentCMS (c) 2015 Bertrand Le Roy, under MIT. See LICENSE.txt for licensing details.
'use strict';

/**
 * Builds indexes from content items and map functions.
 */
function Index(scope) {
  this.scope = scope;
}
Index.service = 'index';
Index.feature = 'query';
Index.scope = 'shell';

/**
 * Creates or gets an index.
 * @param {RegExp|string} [context.idFilter] A regular expression that validates
 *   content item ids before they are read and indexed.
 * @param {Function} context.map The map function takes a content item and returns
 *   an array of index entries, a single index entry, or null.
 *   An index entry should have an id property.
 *   It is recommended to name the map function.
 * @param {Function} [context.orderBy] The function that defines the order
 *   on which the index entries should be sorted.
 *   It takes two index entries A and B, and returns -1 if A comes before B,
 *   and +1 if A comes after B.
 *   It is recommended to name the order function.
 * @returns {object} The index object.
 */
Index.prototype.getIndex = function getIndex(context) {
  var indexStore = this.scope.require('index-store');
  return indexStore.getIndex(context.idFilter, context.map, context.orderBy);
};

module.exports = Index;